const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { REPORT_COLUMNS, listReports, resolveUploadDoctor, validateUpload, sendReport, sendRecordFile } = require('../utils/uploads');

const router = express.Router();

/** Medical records doctors have added for the signed-in patient, newest first. */
router.get('/mine', requireAuth, requireRole('patient'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT r.id, r.record_type AS type, r.title, r.details,
            DATE_FORMAT(r.record_date, '%Y-%m-%d') AS date, r.appointment_id AS appointmentId,
            d.name AS doctor, dep.name AS department,
            r.file_name AS fileName, r.file_mime AS fileMime, r.file_size AS fileSize
       FROM medical_records r
       JOIN doctors d ON d.id = r.doctor_id
       JOIN departments dep ON dep.id = d.department_id
      WHERE r.patient_id = ?
      ORDER BY r.record_date DESC, r.id DESC`,
    [req.user.id],
  );
  res.json(rows);
});

/** A file a doctor attached to one of the patient's records. ?download=1 saves it. */
router.get('/:id/file', requireAuth, requireRole('patient'), async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT file_name, file_mime, file_size, file_data FROM medical_records
      WHERE id = ? AND patient_id = ? AND file_data IS NOT NULL`,
    [req.params.id, req.user.id],
  );
  if (!row) return res.status(404).json({ message: 'File not found.' });
  sendRecordFile(res, row, req.query.download === '1');
});

// ---- Lab reports the patient uploads (patient_reports) ----

/** The patient's uploaded lab reports (metadata). */
router.get('/uploads', requireAuth, requireRole('patient'), async (req, res) => {
  res.json(await listReports(req.user.id));
});

/**
 * Uploads a lab report. Body: { title, reportDate?, notes?, doctorId?, fileName, mimeType, data (base64) }
 * doctorId: the booked doctor it is for; omit or null to share it with all of the patient's doctors.
 */
router.post('/uploads', requireAuth, requireRole('patient'), async (req, res) => {
  const { error, value: v } = validateUpload(req.body);
  if (error) return res.status(400).json({ message: error });
  const doctor = await resolveUploadDoctor(req.user.id, req.body?.doctorId);
  if (doctor.error) return res.status(400).json({ message: doctor.error });
  const [result] = await pool.query(
    `INSERT INTO patient_reports
       (patient_id, doctor_id, title, notes, report_date, file_name, mime_type, size_bytes, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.user.id, doctor.value, v.title, v.notes || null, v.reportDate, v.fileName, v.mimeType, v.file.length, v.file],
  );
  const [[row]] = await pool.query(`SELECT ${REPORT_COLUMNS} FROM patient_reports WHERE id = ?`, [
    result.insertId,
  ]);
  res.status(201).json(row);
});

/** The file itself; ?download=1 saves instead of opening. */
router.get('/uploads/:id/file', requireAuth, requireRole('patient'), async (req, res) => {
  const [[row]] = await pool.query('SELECT * FROM patient_reports WHERE id = ? AND patient_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!row) return res.status(404).json({ message: 'Report not found.' });
  sendReport(res, row, req.query.download === '1');
});

router.delete('/uploads/:id', requireAuth, requireRole('patient'), async (req, res) => {
  const [result] = await pool.query('DELETE FROM patient_reports WHERE id = ? AND patient_id = ?', [
    req.params.id,
    req.user.id,
  ]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Report not found.' });
  res.status(204).end();
});

module.exports = router;
