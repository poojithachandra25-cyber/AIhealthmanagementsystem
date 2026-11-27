// Doctor dashboard endpoints: appointments, patients, availability and profile.
// Patient case files and consultations live in doctor-cases.js.
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isoDate, isPast } = require('../utils/schedule');
const { settleOnCancel } = require('../utils/billing');
const {
  NOT_LINKED,
  profileFor,
  withProfile,
  APPOINTMENT_SELECT,
  mapAppointment,
  ownAppointment,
} = require('../utils/doctor-context');

const router = express.Router();
router.use(requireAuth, requireRole('doctor'));

/**
 * Allowed status changes: current status → statuses the doctor may set.
 * 'missed' records a patient who didn't attend a confirmed visit.
 */
const TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'missed', 'cancelled'],
};

/**
 * Links an unlinked doctor account to the profile the admin registered with the same
 * email. Returns the profile, or null when there is none (or it already has an account).
 */
async function linkByEmail(userId) {
  const [[user]] = await pool.query('SELECT email FROM users WHERE id = ?', [userId]);
  if (!user) return null;
  const [result] = await pool.query(
    'UPDATE doctors SET user_id = ? WHERE email = ? AND user_id IS NULL',
    [userId, user.email],
  );
  if (!result.affectedRows) return null;
  await pool.query(
    `UPDATE users u JOIN doctors d ON d.user_id = u.id JOIN departments dep ON dep.id = d.department_id
        SET u.specialization = dep.name WHERE u.id = ?`,
    [userId],
  );
  return profileFor(userId);
}

/** The doctor's profile and every appointment booked with them. Links the account first if it can. */
router.get('/me', async (req, res) => {
  const profile = (await profileFor(req.user.id)) ?? (await linkByEmail(req.user.id));
  if (!profile) return res.status(404).json(NOT_LINKED);
  const [appointments] = await pool.query(
    `${APPOINTMENT_SELECT} WHERE a.doctor_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [profile.id],
  );
  res.json({ profile, appointments: appointments.map(mapAppointment) });
});

/** Confirms, completes, marks missed or cancels an appointment. Body: { status } */
router.patch('/appointments/:id/status', withProfile, async (req, res) => {
  const { status } = req.body ?? {};
  const appt = await ownAppointment(pool, req.doctor.id, req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  if (!TRANSITIONS[appt.status]?.includes(status)) {
    return res.status(400).json({ message: `A ${appt.status} appointment can't be marked ${status}.` });
  }
  if (status === 'completed' && appt.date > isoDate()) {
    return res.status(400).json({ message: "Only today's or earlier appointments can be completed." });
  }
  if (status === 'missed' && !isPast(appt.date, appt.time)) {
    return res.status(400).json({ message: 'A visit can only be marked missed after its time has passed.' });
  }

  // The status change and the bill settlement succeed or fail together.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE appointments SET status = ? WHERE id = ?', [status, appt.id]);
    // The patient did nothing wrong when the doctor cancels, so a paid bill is always refunded.
    if (status === 'cancelled') await settleOnCancel(conn, appt.id, { refund: true });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json(await ownAppointment(pool, req.doctor.id, appt.id));
});

/** Everyone who has booked with this doctor, with visit counts and their open appointments. */
router.get('/patients', withProfile, async (req, res) => {
  const [patients] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS dateOfBirth,
            u.gender, u.blood_group AS bloodGroup,
            COUNT(*) AS total,
            SUM(a.status = 'completed') AS completed,
            SUM(a.status = 'missed') AS missed,
            SUM(a.status = 'cancelled') AS cancelled,
            DATE_FORMAT(MAX(CASE WHEN a.status = 'completed' THEN a.appointment_date END), '%Y-%m-%d') AS lastVisit
       FROM appointments a JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id = ?
      GROUP BY u.id
      ORDER BY u.name`,
    [req.doctor.id],
  );
  const [open] = await pool.query(
    `${APPOINTMENT_SELECT}
      WHERE a.doctor_id = ? AND a.status IN ('pending', 'confirmed') AND a.appointment_date >= CURDATE()
      ORDER BY a.appointment_date, a.appointment_time`,
    [req.doctor.id],
  );
  const byPatient = new Map();
  for (const row of open) {
    if (isPast(row.date, row.time)) continue;
    if (!byPatient.has(row.patientId)) byPatient.set(row.patientId, []);
    byPatient.get(row.patientId).push(mapAppointment(row));
  }
  res.json(
    patients.map((p) => ({
      ...p,
      total: Number(p.total),
      completed: Number(p.completed),
      missed: Number(p.missed),
      cancelled: Number(p.cancelled),
      open: byPatient.get(p.id) ?? [],
    })),
  );
});

// ---- Availability ----

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SLOT_CHOICES = [15, 20, 30, 45, 60];
const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

/**
 * Replaces the doctor's weekly hours. Patients see the change straight away.
 * Body: { slotMinutes, days: [{ day: 0-6, start: 'HH:MM', end: 'HH:MM' }] }
 * Already-booked appointments are kept; the response counts those now outside the hours.
 */
router.put('/availability', withProfile, async (req, res) => {
  const { slotMinutes, days } = req.body ?? {};
  if (!SLOT_CHOICES.includes(slotMinutes)) {
    return res.status(400).json({ message: `Slot length must be one of ${SLOT_CHOICES.join(', ')} minutes.` });
  }
  if (!Array.isArray(days) || days.length > 7) return res.status(400).json({ message: 'Send up to 7 days.' });

  const seen = new Set();
  for (const d of days) {
    if (!Number.isInteger(d?.day) || d.day < 0 || d.day > 6 || seen.has(d.day)) {
      return res.status(400).json({ message: 'Each day can appear once (0 = Sunday … 6 = Saturday).' });
    }
    seen.add(d.day);
    if (!TIME_RE.test(d.start ?? '') || !TIME_RE.test(d.end ?? '')) {
      return res.status(400).json({ message: 'Times must be HH:MM (24-hour).' });
    }
    if (toMinutes(d.end) - toMinutes(d.start) < slotMinutes) {
      return res.status(400).json({ message: 'Each day must end after it starts, with room for at least one slot.' });
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM doctor_availability WHERE doctor_id = ?', [req.doctor.id]);
    if (days.length) {
      await conn.query(
        'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time, slot_minutes) VALUES ?',
        [days.map((d) => [req.doctor.id, d.day, d.start, d.end, slotMinutes])],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  // Bookings that no longer fit the new hours stay booked; tell the doctor about them.
  const [future] = await pool.query(
    `SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS date, TIME_FORMAT(appointment_time, '%H:%i') AS time,
            DAYOFWEEK(appointment_date) - 1 AS day
       FROM appointments
      WHERE doctor_id = ? AND status IN ('pending', 'confirmed') AND appointment_date >= CURDATE()`,
    [req.doctor.id],
  );
  const hours = new Map(days.map((d) => [d.day, d]));
  const outsideHours = future.filter((a) => {
    const h = hours.get(a.day);
    return !h || toMinutes(a.time) < toMinutes(h.start) || toMinutes(a.time) >= toMinutes(h.end);
  }).length;

  const profile = await profileFor(req.user.id);
  res.json({ availability: profile.availability, outsideHours });
});

// ---- Profile ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;

async function doctorProfile(userId, doctor) {
  const [[account]] = await pool.query(
    'SELECT id, name, email, phone, created_at AS createdAt FROM users WHERE id = ?',
    [userId],
  );
  return { account, doctor };
}

/** The doctor's account plus their admin-managed profile (qualifications etc.). */
router.get('/profile', withProfile, async (req, res) => {
  res.json(await doctorProfile(req.user.id, req.doctor));
});

/**
 * Updates what the doctor may change themselves: name, email, phone and the "About" text.
 * Title, qualifications, registration and experience are managed by the admin.
 */
router.put('/profile', withProfile, async (req, res) => {
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = text(req.body?.name);
  const email = text(req.body?.email).toLowerCase();
  const phone = text(req.body?.phone);
  const intro = text(req.body?.intro);

  if (!name || name.length > 120) return res.status(400).json({ message: 'Enter your name (up to 120 characters).' });
  if (!EMAIL_RE.test(email) || email.length > 190) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ message: 'Enter a valid phone number.' });
  if (!intro || intro.length > 1000) {
    return res.status(400).json({ message: 'Write a short "About" (up to 1000 characters).' });
  }
  const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [email, req.user.id]);
  if (taken.length) return res.status(409).json({ message: 'Another account already uses this email.' });
  const [doctorTaken] = await pool.query('SELECT id FROM doctors WHERE email = ? AND id <> ?', [email, req.doctor.id]);
  if (doctorTaken.length) return res.status(409).json({ message: 'Another doctor already uses this email.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?', [
      name,
      email,
      phone || null,
      req.user.id,
    ]);
    // The profile's email is the login email, so the two stay in step.
    await conn.query('UPDATE doctors SET intro = ?, email = ? WHERE id = ?', [intro, email, req.doctor.id]);
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json(await doctorProfile(req.user.id, await profileFor(req.user.id)));
});

module.exports = router;
