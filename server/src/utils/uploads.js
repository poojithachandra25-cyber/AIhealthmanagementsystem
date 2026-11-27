// Lab reports patients upload (patient_reports). Files arrive as base64 JSON, are checked
// by their real content (magic bytes), and are served back with safe headers.
const { pool } = require('../db');
const { isoDate, parseDate } = require('./schedule');

const MAX_BYTES = 5 * 1024 * 1024;

/** Allowed types and the bytes each file must start with. */
const TYPES = {
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
};

/** Metadata only; the file itself is fetched separately. */
const REPORT_COLUMNS = `
  id, title, notes, DATE_FORMAT(report_date, '%Y-%m-%d') AS date, file_name AS fileName,
  mime_type AS mimeType, size_bytes AS size, created_at AS uploadedAt, doctor_id AS doctorId,
  (SELECT d.name FROM doctors d WHERE d.id = patient_reports.doctor_id) AS doctorName`;

/**
 * A patient's uploaded reports. With `forDoctorId`, only the ones that doctor may see:
 * reports addressed to them plus those shared with all of the patient's doctors (doctor_id NULL).
 */
async function listReports(patientId, forDoctorId = null) {
  const [rows] = await pool.query(
    `SELECT ${REPORT_COLUMNS} FROM patient_reports
      WHERE patient_id = ? ${forDoctorId ? 'AND (doctor_id IS NULL OR doctor_id = ?)' : ''}
      ORDER BY report_date DESC, id DESC`,
    forDoctorId ? [patientId, forDoctorId] : [patientId],
  );
  return rows;
}

/**
 * Checks the doctor a patient chose for an upload: null/'' means "all my doctors";
 * otherwise it must be a doctor the patient has booked. Returns { error } or { value }.
 */
async function resolveUploadDoctor(patientId, doctorId) {
  if (doctorId === null || doctorId === undefined || doctorId === '') return { value: null };
  const id = Number(doctorId);
  if (!Number.isInteger(id) || id <= 0) return { error: 'Choose a doctor from the list.' };
  const [rows] = await pool.query(
    'SELECT 1 FROM appointments WHERE patient_id = ? AND doctor_id = ? LIMIT 1',
    [patientId, id],
  );
  if (!rows.length) return { error: 'You can only send a report to a doctor you have booked.' };
  return { value: id };
}

/**
 * Validates an upload body: { title, reportDate?, notes?, fileName, mimeType, data (base64) }.
 * Returns { error } or { value } with the decoded file.
 */
function validateUpload(body = {}) {
  const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max + 1) : '');
  const title = text(body.title, 160);
  const notes = text(body.notes, 1000);
  const reportDate = text(body.reportDate, 10) || isoDate();
  const type = TYPES[body.mimeType];

  if (!title || title.length > 160) return { error: 'Name the test (up to 160 characters).' };
  if (notes.length > 1000) return { error: 'Keep the notes under 1000 characters.' };
  if (!parseDate(reportDate) || reportDate > isoDate()) {
    return { error: 'The report date must be a valid date, not in the future.' };
  }
  if (typeof body.data !== 'string' || !body.data) return { error: 'Choose a file to upload.' };
  const { error, value: f } = validateFile(body);
  if (error) return { error };
  return { value: { title, notes, reportDate, ...f } };
}

/**
 * Validates an attached file: { fileName, mimeType, data (base64) }. Shared by patient
 * uploads and doctors' lab report attachments. Returns { error } or { value }.
 */
function validateFile(body = {}) {
  const type = TYPES[body.mimeType];
  if (!type) return { error: 'Upload a PDF, PNG or JPG file.' };
  if (typeof body.data !== 'string' || !body.data) return { error: 'Choose a file to upload.' };

  const file = Buffer.from(body.data, 'base64');
  if (!file.length) return { error: 'The file is empty.' };
  if (file.length > MAX_BYTES) return { error: 'The file is larger than 5 MB.' };
  if (!type.magic.every((byte, i) => file[i] === byte)) {
    return { error: "The file's contents don't match its type. Upload a real PDF, PNG or JPG." };
  }

  // Keep a plain, safe file name with the right extension.
  const name = typeof body.fileName === 'string' ? body.fileName.trim().slice(0, 200) : '';
  const base = name.replace(/\.[^.]*$/, '').replace(/[^\w .-]+/g, '_').trim() || 'lab-report';
  return { value: { mimeType: body.mimeType, file, fileName: `${base.slice(0, 180)}.${type.ext}` } };
}

/** Sends a medical record's attached file (medical_records.file_*). */
function sendRecordFile(res, row, download) {
  sendReport(
    res,
    { mime_type: row.file_mime, size_bytes: row.file_size, file_name: row.file_name, data: row.file_data },
    download,
  );
}

/** Sends a stored report's file. `download` forces a save dialog instead of inline viewing. */
function sendReport(res, row, download) {
  res.set({
    'Content-Type': row.mime_type,
    'Content-Length': row.size_bytes,
    'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${row.file_name.replace(/"/g, '')}"`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(row.data);
}

module.exports = { MAX_BYTES, REPORT_COLUMNS, listReports, resolveUploadDoctor, validateUpload, validateFile, sendReport, sendRecordFile };
