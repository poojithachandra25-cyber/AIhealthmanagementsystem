const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { GST_RATE } = require('../config');
const { BOOKING_WINDOW_DAYS, inBookingWindow, doctorSlots } = require('../utils/schedule');

const router = express.Router();

/** Every doctor with their department and weekly consulting hours. */
router.get('/', requireAuth, async (_req, res) => {
  const [doctors] = await pool.query(`
    SELECT d.id, d.name, d.title, d.experience_years AS experience, d.image_url AS image,
           dep.slug AS departmentSlug, dep.name AS department,
           dep.accent_from AS accentFrom, dep.accent_to AS accentTo,
           dep.consultation_fee AS consultationFee, dep.emergency_fee AS emergencyFee
      FROM doctors d JOIN departments dep ON dep.id = d.department_id
     ORDER BY dep.id, d.id
  `);
  const [hours] = await pool.query(`
    SELECT doctor_id AS doctorId, day_of_week AS day,
           TIME_FORMAT(start_time, '%H:%i') AS start, TIME_FORMAT(end_time, '%H:%i') AS end
      FROM doctor_availability ORDER BY doctor_id, day_of_week
  `);

  const byDoctor = new Map(
    doctors.map((d) => [
      d.id,
      { ...d, consultationFee: Number(d.consultationFee), emergencyFee: Number(d.emergencyFee), availability: [] },
    ]),
  );
  for (const { doctorId, ...slot } of hours) byDoctor.get(doctorId)?.availability.push(slot);
  res.json({ bookingWindowDays: BOOKING_WINDOW_DAYS, gstRate: GST_RATE, doctors: [...byDoctor.values()] });
});

/** Slots for one doctor on one date: GET /api/doctors/:id/slots?date=YYYY-MM-DD */
router.get('/:id/slots', requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!inBookingWindow(date)) {
    return res
      .status(400)
      .json({ message: `Choose a date between today and ${BOOKING_WINDOW_DAYS} days from now.` });
  }
  const [[doctor]] = await pool.query('SELECT id FROM doctors WHERE id = ?', [req.params.id]);
  if (!doctor) return res.status(404).json({ message: 'Doctor not found.' });

  const slots = await doctorSlots(pool, doctor.id, date);
  res.json({ date, slots: slots ?? [] });
});

module.exports = router;
