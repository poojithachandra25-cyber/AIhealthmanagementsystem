// Admin dashboard (Specs/admindashboard.md): manage doctors, see patients with their
// appointments, and revenue from bill payments.
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { BILL_SELECT, mapBill } = require('../utils/billing');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const num = (v) => Number(v ?? 0);

router.get('/departments', async (_req, res) => {
  const [rows] = await pool.query('SELECT id, slug, name FROM departments ORDER BY id');
  res.json(rows);
});

// ---- Doctors ----

const DOCTOR_SELECT = `
  SELECT d.id, d.name, d.title, d.experience_years AS experience, d.qualifications,
         d.registration_no AS registrationNo, d.email, d.intro, d.image_url AS image,
         dep.id AS departmentId, dep.name AS department, dep.slug AS departmentSlug,
         d.user_id AS userId, u.email AS accountEmail,
         (SELECT COUNT(*) FROM appointments a WHERE a.doctor_id = d.id) AS appointments,
         (SELECT GROUP_CONCAT(day_of_week ORDER BY day_of_week) FROM doctor_availability v
           WHERE v.doctor_id = d.id) AS days
    FROM doctors d
    JOIN departments dep ON dep.id = d.department_id
    LEFT JOIN users u ON u.id = d.user_id`;

const mapDoctor = (r) => ({
  ...r,
  appointments: num(r.appointments),
  days: r.days ? String(r.days).split(',').map(Number) : [],
  hasAccount: !!r.userId,
});

async function findDoctor(id) {
  const [[row]] = await pool.query(`${DOCTOR_SELECT} WHERE d.id = ?`, [id]);
  return row ? mapDoctor(row) : null;
}

router.get('/doctors', async (_req, res) => {
  const [rows] = await pool.query(`${DOCTOR_SELECT} ORDER BY dep.id, d.name`);
  res.json(rows.map(mapDoctor));
});

/** Validates a doctor body; returns { error } or { value }. `existing` is the row being edited. */
async function validateDoctor(body, existing = null) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
  const v = {
    name: text(body.name, 120),
    title: text(body.title, 120),
    departmentId: Number(body.departmentId),
    experience: Number(body.experience),
    qualifications: text(body.qualifications, 255),
    registrationNo: text(body.registrationNo, 40),
    email: text(body.email, 190).toLowerCase(),
    intro: text(body.intro, 1000),
    image: text(body.image, 255),
  };
  if (!v.name || v.name.length > 120) return { error: "Enter the doctor's name (up to 120 characters)." };
  if (!v.title || v.title.length > 120) return { error: 'Enter a designation, e.g. Senior Cardiologist.' };
  if (!Number.isInteger(v.experience) || v.experience < 0 || v.experience > 60) {
    return { error: 'Experience must be a whole number of years (0–60).' };
  }
  if (v.qualifications.length > 255) return { error: 'Keep qualifications under 255 characters.' };
  if (v.registrationNo.length > 40) return { error: 'Keep the registration number under 40 characters.' };
  if (!EMAIL_RE.test(v.email) || v.email.length > 190) return { error: 'Enter a valid email address.' };
  if (!v.intro) v.intro = `${v.title} at MedPoint.`;
  if (v.intro.length > 1000) return { error: 'Keep the introduction under 1000 characters.' };
  if (v.image && !/^https?:\/\/\S+$/.test(v.image)) return { error: 'The photo must be an http(s) URL, or leave it empty.' };

  const [[dept]] = await pool.query('SELECT id, name FROM departments WHERE id = ?', [v.departmentId]);
  if (!dept) return { error: 'Choose a department.' };
  v.departmentName = dept.name;

  // The email must be free: not on another doctor, and not on another user's account.
  const [doctorClash] = await pool.query('SELECT id FROM doctors WHERE email = ? AND id <> ?', [
    v.email,
    existing?.id ?? 0,
  ]);
  if (doctorClash.length) return { error: 'Another doctor already uses this email.', status: 409 };
  const [userClash] = await pool.query('SELECT id, role FROM users WHERE email = ? AND id <> ?', [
    v.email,
    existing?.userId ?? 0,
  ]);
  if (userClash.length) {
    // An unlinked doctor account with this email is fine: it gets linked on its next sign-in.
    const linkable = userClash[0].role === 'doctor' && !existing?.userId;
    if (!linkable) return { error: 'This email belongs to another account.', status: 409 };
  }
  return { value: v };
}

/**
 * Adds a doctor profile. The doctor then creates their account with the same email
 * (Sign up → Doctor), which links it. Default hours Mon–Fri 10:00–14:00 make them
 * bookable straight away; they can change them under Availability.
 */
router.post('/doctors', async (req, res) => {
  const { error, status, value: v } = await validateDoctor(req.body ?? {});
  if (error) return res.status(status ?? 400).json({ message: error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO doctors (department_id, name, title, experience_years, qualifications, registration_no, email, intro, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.departmentId, v.name, v.title, v.experience, v.qualifications || null, v.registrationNo || null, v.email, v.intro, v.image],
    );
    await conn.query(
      'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time) VALUES ?',
      [[1, 2, 3, 4, 5].map((day) => [result.insertId, day, '10:00', '14:00'])],
    );
    await conn.commit();
    res.status(201).json(await findDoctor(result.insertId));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/** Updates a doctor's details. A linked account's login email and specialization follow along. */
router.put('/doctors/:id', async (req, res) => {
  const existing = await findDoctor(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Doctor not found.' });
  const { error, status, value: v } = await validateDoctor(req.body ?? {}, existing);
  if (error) return res.status(status ?? 400).json({ message: error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE doctors SET department_id = ?, name = ?, title = ?, experience_years = ?, qualifications = ?,
              registration_no = ?, email = ?, intro = ?, image_url = ?
        WHERE id = ?`,
      [v.departmentId, v.name, v.title, v.experience, v.qualifications || null, v.registrationNo || null, v.email, v.intro, v.image || existing.image, existing.id],
    );
    if (existing.userId) {
      await conn.query('UPDATE users SET email = ?, specialization = ? WHERE id = ?', [
        v.email,
        v.departmentName,
        existing.userId,
      ]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json(await findDoctor(existing.id));
});

// ---- Patients ----

/** Every patient with their appointments (doctor, status, payment), newest first. */
router.get('/patients', async (_req, res) => {
  const [patients] = await pool.query(
    `SELECT id, name, email, phone, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth, gender,
            blood_group AS bloodGroup, created_at AS createdAt
       FROM users WHERE role = 'patient' ORDER BY name`,
  );
  const [appointments] = await pool.query(
    `SELECT a.id, a.patient_id AS patientId, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(a.appointment_time, '%H:%i') AS time, a.appointment_type AS type, a.status, a.reason,
            d.name AS doctor, dep.name AS department, b.status AS billStatus, b.total AS billTotal
       FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       JOIN departments dep ON dep.id = d.department_id
       LEFT JOIN bills b ON b.appointment_id = a.id
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
  );
  const byPatient = new Map();
  for (const a of appointments) {
    if (!byPatient.has(a.patientId)) byPatient.set(a.patientId, []);
    byPatient.get(a.patientId).push({ ...a, billTotal: a.billTotal === null ? null : num(a.billTotal) });
  }
  res.json(patients.map((p) => ({ ...p, appointments: byPatient.get(p.id) ?? [] })));
});

// ---- Revenue ----

/** Revenue from bill payments: totals, last 6 months, by department, doctor and method. */
router.get('/revenue', async (_req, res) => {
  const [[t]] = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN status = 'paid' THEN total END), 0) AS collected,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN consultation_fee END), 0) AS net,
           COALESCE(SUM(CASE WHEN status = 'paid' THEN gst_amount END), 0) AS gst,
           SUM(status = 'paid') AS paidCount,
           COALESCE(SUM(CASE WHEN status = 'refunded' THEN total END), 0) AS refunded,
           SUM(status = 'refunded') AS refundedCount,
           COALESCE(SUM(CASE WHEN status IN ('pending', 'failed') THEN total END), 0) AS due,
           SUM(status IN ('pending', 'failed')) AS dueCount,
           SUM(status = 'failed') AS failedCount
      FROM bills`);
  const [[month]] = await pool.query(`
    SELECT COALESCE(SUM(CASE WHEN paid_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN total END), 0) AS thisMonth,
           COALESCE(SUM(CASE WHEN paid_at >= DATE_FORMAT(CURDATE() - INTERVAL 1 MONTH, '%Y-%m-01')
                              AND paid_at < DATE_FORMAT(CURDATE(), '%Y-%m-01') THEN total END), 0) AS lastMonth
      FROM bills WHERE status = 'paid'`);
  const [byMonth] = await pool.query(`
    SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month, SUM(total) AS revenue, COUNT(*) AS bills
      FROM bills
     WHERE status = 'paid' AND paid_at >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01')
     GROUP BY month`);
  const [byDepartment] = await pool.query(`
    SELECT dep.name AS label, COALESCE(SUM(b.total), 0) AS revenue, COUNT(b.id) AS bills
      FROM departments dep
      LEFT JOIN doctors d ON d.department_id = dep.id
      LEFT JOIN appointments a ON a.doctor_id = d.id
      LEFT JOIN bills b ON b.appointment_id = a.id AND b.status = 'paid'
     GROUP BY dep.id
     ORDER BY revenue DESC, dep.id`);
  const [byDoctor] = await pool.query(`
    SELECT d.name AS label, dep.name AS department, SUM(b.total) AS revenue, COUNT(*) AS bills
      FROM bills b
      JOIN appointments a ON a.id = b.appointment_id
      JOIN doctors d ON d.id = a.doctor_id
      JOIN departments dep ON dep.id = d.department_id
     WHERE b.status = 'paid'
     GROUP BY d.id
     ORDER BY revenue DESC
     LIMIT 5`);
  const [byMethod] = await pool.query(`
    SELECT payment_method AS method, SUM(total) AS revenue, COUNT(*) AS bills
      FROM bills WHERE status = 'paid' GROUP BY payment_method`);
  const [recent] = await pool.query(`
    ${BILL_SELECT}
     WHERE b.status IN ('paid', 'failed', 'refunded')
     ORDER BY b.updated_at DESC, b.id DESC
     LIMIT 10`);

  const rows = (list) => list.map((r) => ({ ...r, revenue: num(r.revenue), bills: num(r.bills) }));
  res.json({
    totals: {
      collected: num(t.collected),
      net: num(t.net),
      gst: num(t.gst),
      paidCount: num(t.paidCount),
      refunded: num(t.refunded),
      refundedCount: num(t.refundedCount),
      due: num(t.due),
      dueCount: num(t.dueCount),
      failedCount: num(t.failedCount),
      thisMonth: num(month.thisMonth),
      lastMonth: num(month.lastMonth),
    },
    byMonth: rows(byMonth),
    byDepartment: rows(byDepartment),
    byDoctor: rows(byDoctor),
    byMethod: rows(byMethod),
    recent: recent.map(mapBill),
  });
});

module.exports = router;
