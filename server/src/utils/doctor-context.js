// Shared by the doctor routes: resolves the signed-in doctor's linked profile.
// A doctor account works through the `doctors` row linked to it (doctors.user_id):
// that is the row patients book against.
const { pool } = require('../db');

const NOT_LINKED = {
  code: 'NOT_LINKED',
  message: 'Your account is not linked to a doctor profile yet.',
};

async function profileFor(userId) {
  const [[profile]] = await pool.query(
    `SELECT d.id, d.name, d.title, d.experience_years AS experience, d.image_url AS image,
            d.qualifications, d.registration_no AS registrationNo, d.intro,
            dep.name AS department, dep.slug AS departmentSlug,
            dep.accent_from AS accentFrom, dep.accent_to AS accentTo
       FROM doctors d JOIN departments dep ON dep.id = d.department_id
      WHERE d.user_id = ?`,
    [userId],
  );
  if (!profile) return null;
  const [availability] = await pool.query(
    `SELECT day_of_week AS day, TIME_FORMAT(start_time, '%H:%i') AS start,
            TIME_FORMAT(end_time, '%H:%i') AS end, slot_minutes AS slotMinutes
       FROM doctor_availability WHERE doctor_id = ? ORDER BY day_of_week`,
    [profile.id],
  );
  return { ...profile, availability };
}

/** Middleware: sets req.doctor, or answers 404 NOT_LINKED. */
async function withProfile(req, res, next) {
  const profile = await profileFor(req.user.id);
  if (!profile) return res.status(404).json(NOT_LINKED);
  req.doctor = profile;
  next();
}

/** Appointment columns the doctor screens use, with the patient's basics. */
const APPOINTMENT_SELECT = `
  SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
         TIME_FORMAT(a.appointment_time, '%H:%i') AS time,
         a.appointment_type AS type, a.status, a.reason, a.created_at AS createdAt,
         u.id AS patientId, u.name AS patient, u.email AS patientEmail, u.phone AS patientPhone,
         DATE_FORMAT(u.date_of_birth, '%Y-%m-%d') AS patientDob, u.gender AS patientGender,
         (SELECT COUNT(*) FROM medical_records r WHERE r.appointment_id = a.id) AS recordCount,
         EXISTS (SELECT 1 FROM consultations c WHERE c.appointment_id = a.id) AS hasConsultation,
         b.status AS billStatus
    FROM appointments a
    JOIN users u ON u.id = a.patient_id
    LEFT JOIN bills b ON b.appointment_id = a.id`;

const mapAppointment = (row) => ({ ...row, hasConsultation: !!row.hasConsultation });

/** One of this doctor's appointments (full row), or null. */
async function ownAppointment(db, doctorId, appointmentId) {
  const [[row]] = await db.query(`${APPOINTMENT_SELECT} WHERE a.id = ? AND a.doctor_id = ?`, [
    appointmentId,
    doctorId,
  ]);
  return row ? mapAppointment(row) : null;
}

module.exports = { NOT_LINKED, profileFor, withProfile, APPOINTMENT_SELECT, mapAppointment, ownAppointment };
