// Patient case files for the doctor's View and Update screens:
// the patient's history, records, lab reports and the visit's consultation (prescription).
const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { isoDate } = require('../utils/schedule');
const { withProfile, ownAppointment } = require('../utils/doctor-context');
const { listReports, sendReport, validateFile, sendRecordFile } = require('../utils/uploads');

const router = express.Router();
router.use(requireAuth, requireRole('doctor'), withProfile);

/** Records and consultations can be written once the doctor has accepted the visit. */
const RECORDABLE = ['confirmed', 'completed'];

const RECORD_SELECT = `
  SELECT r.id, r.record_type AS type, r.title, r.details, r.appointment_id AS appointmentId,
         r.consultation_id AS consultationId, DATE_FORMAT(r.record_date, '%Y-%m-%d') AS date,
         d.name AS doctor, dep.name AS department, r.doctor_id = ? AS mine,
         r.file_name AS fileName, r.file_mime AS fileMime, r.file_size AS fileSize
    FROM medical_records r
    JOIN doctors d ON d.id = r.doctor_id
    JOIN departments dep ON dep.id = d.department_id`;

const mapRecord = (r) => ({ ...r, mine: !!r.mine });

async function loadConsultation(appointmentId) {
  const [[c]] = await pool.query(
    `SELECT id, diagnosis, blood_pressure AS bloodPressure, pulse, temperature, weight, advice,
            recommended_tests AS tests, updated_at AS updatedAt
       FROM consultations WHERE appointment_id = ?`,
    [appointmentId],
  );
  if (!c) return null;
  const [medicines] = await pool.query(
    `SELECT name, dosage, frequency, duration FROM prescription_items
      WHERE consultation_id = ? ORDER BY sort_order, id`,
    [c.id],
  );
  return { ...c, tests: c.tests ? c.tests.split(',').map((t) => t.trim()).filter(Boolean) : [], medicines };
}

/**
 * Everything the doctor needs about one appointment's patient: their details,
 * every visit with this doctor (completed, missed, cancelled…), all their medical
 * records and lab reports, and this visit's consultation if one was saved.
 */
router.get('/appointments/:id/case', async (req, res) => {
  const appt = await ownAppointment(pool, req.doctor.id, req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });

  const [[patient]] = await pool.query(
    `SELECT id, name, email, phone, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth, gender,
            blood_group AS bloodGroup, address, emergency_contact_name AS emergencyContactName,
            emergency_contact_phone AS emergencyContactPhone
       FROM users WHERE id = ?`,
    [appt.patientId],
  );
  const [history] = await pool.query(
    `SELECT a.id, DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS date,
            TIME_FORMAT(a.appointment_time, '%H:%i') AS time, a.appointment_type AS type,
            a.status, a.reason, c.diagnosis
       FROM appointments a LEFT JOIN consultations c ON c.appointment_id = a.id
      WHERE a.patient_id = ? AND a.doctor_id = ?
      ORDER BY a.appointment_date DESC, a.appointment_time DESC`,
    [appt.patientId, req.doctor.id],
  );
  const [records] = await pool.query(`${RECORD_SELECT} WHERE r.patient_id = ? ORDER BY r.record_date DESC, r.id DESC`, [
    req.doctor.id,
    appt.patientId,
  ]);

  res.json({
    appointment: appt,
    patient,
    history,
    records: records.map(mapRecord),
    // Lab reports the patient uploaded themselves.
    // Only the uploads addressed to this doctor, or shared with all the patient's doctors.
    uploads: await listReports(appt.patientId, req.doctor.id),
    consultation: await loadConsultation(appt.id),
  });
});

/**
 * A file the patient uploaded, for a doctor with an appointment with that patient.
 * The appointment scopes access: the report must belong to its patient. ?download=1 saves it.
 */
router.get('/appointments/:id/uploads/:reportId/file', async (req, res) => {
  const appt = await ownAppointment(pool, req.doctor.id, req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  const [[row]] = await pool.query(
    `SELECT * FROM patient_reports
      WHERE id = ? AND patient_id = ? AND (doctor_id IS NULL OR doctor_id = ?)`,
    [req.params.reportId, appt.patientId, req.doctor.id],
  );
  if (!row) return res.status(404).json({ message: 'Report not found.' });
  sendReport(res, row, req.query.download === '1');
});

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Builds the patient-facing records a consultation produces. */
function recordsFor(c) {
  const vitals = [
    c.bloodPressure && `BP ${c.bloodPressure}`,
    c.pulse && `Pulse ${c.pulse}`,
    c.temperature && `Temperature ${c.temperature}`,
    c.weight && `Weight ${c.weight}`,
  ].filter(Boolean);
  const out = [['diagnosis', c.diagnosis, vitals.length ? `Vitals: ${vitals.join(' · ')}` : null]];
  if (c.medicines.length) {
    const names = c.medicines.map((m) => m.name).join(', ');
    const lines = c.medicines.map((m, i) => {
      const how = [m.dosage, m.frequency, m.duration && `for ${m.duration}`].filter(Boolean).join(' · ');
      return `${i + 1}. ${m.name}${how ? ` (${how})` : ''}`;
    });
    out.push(['prescription', names.length > 160 ? `${names.slice(0, 157)}...` : names, lines.join('\n')]);
  }
  if (c.advice || c.tests.length) {
    const parts = [c.advice, c.tests.length ? `Recommended tests: ${c.tests.join(', ')}` : null].filter(Boolean);
    out.push(['advice', c.tests.length ? 'Advice & recommended tests' : "Doctor's advice", parts.join('\n\n')]);
  }
  return out;
}

/**
 * Saves the visit's consultation (diagnosis, vitals, medicines, advice, tests) and
 * republishes it to the patient's Medical Records. Body: { diagnosis, bloodPressure,
 * pulse, temperature, weight, medicines: [{ name, dosage, frequency, duration }],
 * advice, tests: string[], complete?: boolean }
 */
router.put('/appointments/:id/consultation', async (req, res) => {
  const appt = await ownAppointment(pool, req.doctor.id, req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  if (!RECORDABLE.includes(appt.status)) {
    return res.status(400).json({ message: 'Confirm the appointment before writing a prescription.' });
  }

  const b = req.body ?? {};
  const c = {
    diagnosis: text(b.diagnosis, 255),
    bloodPressure: text(b.bloodPressure, 15),
    pulse: text(b.pulse, 15),
    temperature: text(b.temperature, 15),
    weight: text(b.weight, 15),
    advice: text(b.advice, 2000),
    tests: (Array.isArray(b.tests) ? b.tests : []).map((t) => text(t, 60).replace(/,/g, ' ')).filter(Boolean),
    medicines: (Array.isArray(b.medicines) ? b.medicines : [])
      .map((m) => ({
        name: text(m?.name, 120),
        dosage: text(m?.dosage, 60),
        frequency: text(m?.frequency, 60),
        duration: text(m?.duration, 60),
      }))
      .filter((m) => m.name || m.dosage || m.frequency || m.duration),
  };
  if (!c.diagnosis) return res.status(400).json({ message: 'Enter a diagnosis.' });
  if (c.medicines.some((m) => !m.name)) return res.status(400).json({ message: 'Every medicine needs a name.' });
  if (c.medicines.length > 20) return res.status(400).json({ message: 'Add up to 20 medicines.' });
  if (c.tests.length > 20) return res.status(400).json({ message: 'Suggest up to 20 tests.' });
  c.tests = [...new Set(c.tests)];
  const complete = b.complete === true;
  if (complete && appt.date > isoDate()) {
    return res.status(400).json({ message: "Only today's or earlier visits can be marked completed." });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const values = [
      c.diagnosis,
      c.bloodPressure || null,
      c.pulse || null,
      c.temperature || null,
      c.weight || null,
      c.advice || null,
      c.tests.join(', ') || null,
    ];
    await conn.query(
      `INSERT INTO consultations
         (appointment_id, doctor_id, patient_id, diagnosis, blood_pressure, pulse, temperature, weight,
          advice, recommended_tests)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE diagnosis = VALUES(diagnosis), blood_pressure = VALUES(blood_pressure),
         pulse = VALUES(pulse), temperature = VALUES(temperature), weight = VALUES(weight),
         advice = VALUES(advice), recommended_tests = VALUES(recommended_tests)`,
      [appt.id, req.doctor.id, appt.patientId, ...values],
    );
    const [[{ id }]] = await conn.query('SELECT id FROM consultations WHERE appointment_id = ?', [appt.id]);

    await conn.query('DELETE FROM prescription_items WHERE consultation_id = ?', [id]);
    if (c.medicines.length) {
      await conn.query(
        'INSERT INTO prescription_items (consultation_id, sort_order, name, dosage, frequency, duration) VALUES ?',
        [c.medicines.map((m, i) => [id, i, m.name, m.dosage || null, m.frequency || null, m.duration || null])],
      );
    }

    // Republish to the patient's Medical Records (replacing this consultation's earlier records).
    await conn.query('DELETE FROM medical_records WHERE consultation_id = ?', [id]);
    await conn.query(
      `INSERT INTO medical_records
         (patient_id, doctor_id, appointment_id, consultation_id, record_type, title, details, record_date)
       VALUES ?`,
      [recordsFor(c).map(([type, title, details]) => [appt.patientId, req.doctor.id, appt.id, id, type, title, details, appt.date])],
    );

    if (complete && appt.status === 'confirmed') {
      await conn.query("UPDATE appointments SET status = 'completed' WHERE id = ?", [appt.id]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  res.json({
    appointment: await ownAppointment(pool, req.doctor.id, appt.id),
    consultation: await loadConsultation(appt.id),
  });
});

// ---- Lab reports (the Update dialog's Reports tab) ----

/**
 * Adds a lab report result to a confirmed or completed visit, optionally with the report file.
 * Body: { title, details?, file?: { fileName, mimeType, data (base64) } }
 */
router.post('/appointments/:id/reports', async (req, res) => {
  const appt = await ownAppointment(pool, req.doctor.id, req.params.id);
  if (!appt) return res.status(404).json({ message: 'Appointment not found.' });
  if (!RECORDABLE.includes(appt.status)) {
    return res.status(400).json({ message: 'Confirm the appointment before adding lab reports.' });
  }
  const title = text(req.body?.title, 200);
  const details = text(req.body?.details, 2001);
  if (!title || title.length > 160) return res.status(400).json({ message: 'Name the test (up to 160 characters).' });
  if (details.length > 2000) return res.status(400).json({ message: 'Keep the results under 2000 characters.' });
  let f = null;
  if (req.body?.file) {
    const { error, value } = validateFile(req.body.file);
    if (error) return res.status(400).json({ message: error });
    f = value;
  }
  if (!details && !f) {
    return res.status(400).json({ message: 'Add the results, upload the report file, or both.' });
  }

  const [result] = await pool.query(
    `INSERT INTO medical_records
       (patient_id, doctor_id, appointment_id, record_type, title, details, record_date,
        file_name, file_mime, file_size, file_data)
     VALUES (?, ?, ?, 'lab_report', ?, ?, CURDATE(), ?, ?, ?, ?)`,
    [appt.patientId, req.doctor.id, appt.id, title, details || null,
      f?.fileName ?? null, f?.mimeType ?? null, f?.file.length ?? null, f?.file ?? null],
  );
  const [[record]] = await pool.query(`${RECORD_SELECT} WHERE r.id = ?`, [req.doctor.id, result.insertId]);
  res.status(201).json(mapRecord(record));
});

/**
 * A record's attached file, for a doctor who has an appointment with that patient.
 * ?download=1 saves it instead of opening it.
 */
router.get('/records/:id/file', async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT r.file_name, r.file_mime, r.file_size, r.file_data
       FROM medical_records r
      WHERE r.id = ? AND r.file_data IS NOT NULL
        AND EXISTS (SELECT 1 FROM appointments a WHERE a.patient_id = r.patient_id AND a.doctor_id = ?)`,
    [req.params.id, req.doctor.id],
  );
  if (!row) return res.status(404).json({ message: 'File not found.' });
  sendRecordFile(res, row, req.query.download === '1');
});

/** Deletes a lab report this doctor added by hand (consultation records are replaced by saving). */
router.delete('/records/:id', async (req, res) => {
  const [result] = await pool.query(
    'DELETE FROM medical_records WHERE id = ? AND doctor_id = ? AND consultation_id IS NULL',
    [req.params.id, req.doctor.id],
  );
  if (!result.affectedRows) return res.status(404).json({ message: 'Record not found.' });
  res.status(204).end();
});

module.exports = router;
