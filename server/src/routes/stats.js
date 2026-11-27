const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
const TREND_DAYS = 14;

/**
 * Daily row counts for the last TREND_DAYS days, oldest first.
 * `ago` is computed in SQL so JS and MySQL never disagree about time zones.
 */
async function dailyCounts(table, where = '1 = 1', params = []) {
  const [rows] = await pool.query(
    `SELECT DATEDIFF(CURDATE(), DATE(created_at)) AS ago, COUNT(*) AS c
       FROM ${table}
      WHERE ${where} AND created_at >= CURDATE() - INTERVAL ${TREND_DAYS - 1} DAY
      GROUP BY ago`,
    params,
  );
  const days = Array(TREND_DAYS).fill(0);
  for (const { ago, c } of rows) days[TREND_DAYS - 1 - ago] = Number(c);
  return days;
}

router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const [[counts]] = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE role = 'patient') AS patients,
      (SELECT COUNT(*) FROM users WHERE role = 'doctor')  AS doctors,
      (SELECT COUNT(*) FROM users WHERE role = 'admin')   AS admins,
      (SELECT COUNT(*) FROM contact_messages)             AS messages,
      (SELECT COUNT(*) FROM appointments)                 AS appointments
  `);

  const [patients, doctors, messages, appointments] = await Promise.all([
    dailyCounts('users', "role = 'patient'"),
    dailyCounts('users', "role = 'doctor'"),
    dailyCounts('contact_messages'),
    dailyCounts('appointments'),
  ]);

  // Appointment status per month for the last 6 months (oldest first).
  const [byMonth] = await pool.query(`
    SELECT DATE_FORMAT(appointment_date, '%Y-%m') AS month, status, COUNT(*) AS c
      FROM appointments
     WHERE appointment_date >= DATE_FORMAT(CURDATE() - INTERVAL 5 MONTH, '%Y-%m-01')
     GROUP BY month, status
  `);

  const [upcomingDates] = await pool.query(`
    SELECT DATE_FORMAT(appointment_date, '%Y-%m-%d') AS date, COUNT(*) AS c
      FROM appointments
     WHERE appointment_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
       AND appointment_date <  DATE_FORMAT(CURDATE() + INTERVAL 2 MONTH, '%Y-%m-01')
     GROUP BY date
  `);

  const [recentUsers] = await pool.query(`
    SELECT id, name, email, role, specialization, created_at AS createdAt
      FROM users ORDER BY created_at DESC, id DESC LIMIT 6
  `);

  res.json({
    ...counts,
    trends: { patients, doctors, messages, appointments },
    appointmentsByMonth: byMonth.map((r) => ({ month: r.month, status: r.status, count: Number(r.c) })),
    appointmentDates: upcomingDates.map((r) => ({ date: r.date, count: Number(r.c) })),
    recentUsers,
  });
});

module.exports = router;
