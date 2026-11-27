const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { BOOKING_WINDOW_DAYS, inBookingWindow, isPast, doctorSlots } = require('../utils/schedule');
const { createBill, settleOnCancel } = require('../utils/billing');

const router = express.Router();
const TYPES = ['regular', 'emergency'];

const APPOINTMENT_COLUMNS = `
  a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
  TIME_FORMAT(a.appointment_time, '%H:%i') AS time,
  a.appointment_type AS type, a.status, a.reason, a.created_at AS createdAt,
  d.id AS doctorId, d.name AS doctor, d.title AS doctorTitle, d.image_url AS doctorImage,
  dep.name AS department, dep.slug AS departmentSlug,
  b.id AS billId, b.status AS billStatus, b.total AS billTotal`;

const APPOINTMENT_JOINS = `
  FROM appointments a
  JOIN doctors d ON d.id = a.doctor_id
  JOIN departments dep ON dep.id = d.department_id
  LEFT JOIN bills b ON b.appointment_id = a.id`;

/** mysql2 returns DECIMAL as a string. */
const mapAppointment = (row) => ({ ...row, billTotal: row.billTotal === null ? null : Number(row.billTotal) });

async function findAppointment(db, id) {
  const [[row]] = await db.query(`SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_JOINS} WHERE a.id = ?`, [id]);
  return row && mapAppointment(row);
}

/** The signed-in patient's appointments, newest first. */
router.get('/mine', requireAuth, requireRole('patient'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ${APPOINTMENT_COLUMNS} ${APPOINTMENT_JOINS}
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [req.user.id],
  );
  res.json(rows.map(mapAppointment));
});

/** Books a slot. Body: { doctorId, date, time, type, reason? } */
router.post('/', requireAuth, requireRole('patient'), async (req, res) => {
  const { doctorId, date, time, type, reason } = req.body ?? {};
  const note = typeof reason === 'string' ? reason.trim() : '';

  if (!Number.isInteger(doctorId)) return res.status(400).json({ message: 'Choose a doctor.' });
  if (!TYPES.includes(type)) return res.status(400).json({ message: 'Choose an appointment type.' });
  if (!inBookingWindow(date)) {
    return res
      .status(400)
      .json({ message: `Choose a date between today and ${BOOKING_WINDOW_DAYS} days from now.` });
  }
  if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) {
    return res.status(400).json({ message: 'Choose a time slot.' });
  }
  if (note.length > 255) {
    return res.status(400).json({ message: 'Keep the reason under 255 characters.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Lock the doctor row so two patients can't take the same slot at once.
    const [[doctor]] = await conn.query('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [doctorId]);
    if (!doctor) {
      await conn.rollback();
      return res.status(404).json({ message: 'Doctor not found.' });
    }

    const slots = await doctorSlots(conn, doctorId, date);
    const slot = slots?.find((s) => s.time === time);
    if (!slot) {
      await conn.rollback();
      return res.status(400).json({ message: 'The doctor is not available at that time.' });
    }
    if (!slot.available) {
      await conn.rollback();
      return res
        .status(409)
        .json({ message: 'That slot was just taken or has passed. Please pick another.' });
    }

    const [clash] = await conn.query(
      `SELECT 1 FROM appointments
        WHERE patient_id = ? AND appointment_date = ? AND appointment_time = ? AND status <> 'cancelled'`,
      [req.user.id, date, time],
    );
    if (clash.length) {
      await conn.rollback();
      return res.status(409).json({ message: 'You already have an appointment at that time.' });
    }

    const [result] = await conn.query(
      `INSERT INTO appointments
         (patient_id, doctor_id, appointment_date, appointment_time, appointment_type, reason)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.user.id, doctorId, date, time, type, note || null],
    );
    // Every booking gets a bill (fee + GST); the patient pays it next.
    await createBill(conn, result.insertId);
    await conn.commit();
    res.status(201).json(await findAppointment(pool, result.insertId));
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/** Cancels one of the patient's own upcoming appointments. Only pending ones are refunded. */
router.patch('/:id/cancel', requireAuth, requireRole('patient'), async (req, res) => {
  const [[appt]] = await pool.query(
    `SELECT id, status, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(appointment_time, '%H:%i') AS time
       FROM appointments WHERE id = ? AND patient_id = ?`,
    [req.params.id, req.user.id],
  );
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  if (!['pending', 'confirmed'].includes(appt.status) || isPast(appt.date, appt.time)) {
    return res.status(400).json({ message: 'Only upcoming appointments can be cancelled.' });
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [appt.id]);
    // A pending (not yet accepted) appointment is refunded; a confirmed one is not.
    await settleOnCancel(conn, appt.id, { refund: appt.status === 'pending' });
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  res.json(await findAppointment(pool, appt.id));
});

module.exports = router;
