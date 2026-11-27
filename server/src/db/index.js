// MySQL connection pool plus schema bootstrap.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { DB } = require('../config');
const seedDepartments = require('./seed-data');

const pool = mysql.createPool({
  host: DB.host,
  port: DB.port,
  user: DB.user,
  password: DB.password,
  database: DB.database,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

/** Creates the database and tables if missing, then seeds departments and doctors once. */
async function initDatabase() {
  const admin = await mysql.createConnection({
    host: DB.host,
    port: DB.port,
    user: DB.user,
    password: DB.password,
    multipleStatements: true,
  });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${DB.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await admin.query(`USE \`${DB.database}\``);
    await admin.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  } finally {
    await admin.end();
  }
  await migrate();
  await seed();
  await seedAvailability();
  await seedFees();
  await backfillBills();
  await seedDoctorDetails();
  await seedDoctorEmails();
}

/** Sets each department's fees from seed-data.js while they are still unset (0). */
async function seedFees() {
  for (const d of seedDepartments) {
    await pool.query(
      `UPDATE departments SET consultation_fee = ?, emergency_fee = ?
        WHERE slug = ? AND consultation_fee = 0 AND emergency_fee = 0`,
      [d.fees[0], d.fees[1], d.slug],
    );
  }
}

/** Gives appointments booked before billing existed a bill, so every booking can be paid. */
async function backfillBills() {
  const { createBill } = require('../utils/billing');
  const [rows] = await pool.query(
    `SELECT a.id FROM appointments a LEFT JOIN bills b ON b.appointment_id = a.id WHERE b.id IS NULL`,
  );
  for (const { id } of rows) await createBill(pool, id);
  if (rows.length) console.log(`Created bills for ${rows.length} earlier appointments.`);
}

/** Columns added after a table was first created. CREATE TABLE IF NOT EXISTS won't add them. */
const ADDED_COLUMNS = [
  [
    'appointments',
    'appointment_type',
    "ENUM('regular', 'emergency') NOT NULL DEFAULT 'regular' AFTER appointment_time",
  ],
  // Consultation fees in INR, before GST.
  ['departments', 'consultation_fee', 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER hours'],
  ['departments', 'emergency_fee', 'DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER consultation_fee'],
  // Patient profile details, edited from Profile & Settings.
  ['users', 'date_of_birth', 'DATE NULL AFTER phone'],
  ['users', 'gender', "ENUM('female', 'male', 'other') NULL AFTER date_of_birth"],
  ['users', 'blood_group', 'VARCHAR(3) NULL AFTER gender'],
  ['users', 'address', 'VARCHAR(255) NULL AFTER blood_group'],
  ['users', 'emergency_contact_name', 'VARCHAR(120) NULL AFTER address'],
  ['users', 'emergency_contact_phone', 'VARCHAR(30) NULL AFTER emergency_contact_name'],
  // JWTs issued before this moment are rejected (password change/reset signs out other sessions).
  ['users', 'password_changed_at', 'TIMESTAMP NULL DEFAULT NULL AFTER password_hash'],
  // Admin-managed doctor credentials, shown read-only on the doctor's Profile.
  ['doctors', 'qualifications', 'VARCHAR(255) NULL AFTER experience_years'],
  ['doctors', 'registration_no', 'VARCHAR(40) NULL AFTER qualifications'],
  // Email the admin registers for a doctor; signing up with it links the account to this profile.
  ['doctors', 'email', 'VARCHAR(190) NULL AFTER registration_no'],
  // Records generated from a consultation (Update → Prescription), replaced on each save.
  ['medical_records', 'consultation_id', 'INT UNSIGNED NULL AFTER appointment_id'],
  // Which doctor a patient's uploaded lab report is for; NULL = shared with all their doctors.
  ['patient_reports', 'doctor_id', 'INT UNSIGNED NULL AFTER patient_id'],
  // Optional file a doctor attaches to a lab report (PDF/PNG/JPG, ≤ 5 MB).
  ['medical_records', 'file_name', 'VARCHAR(200) NULL AFTER record_date'],
  ['medical_records', 'file_mime', 'VARCHAR(60) NULL AFTER file_name'],
  ['medical_records', 'file_size', 'INT UNSIGNED NULL AFTER file_mime'],
  ['medical_records', 'file_data', 'LONGBLOB NULL AFTER file_size'],
];

async function migrate() {
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const [rows] = await pool.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [DB.database, table, column],
    );
    if (!rows.length) await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }

  // Doctor emails are unique (NULLs allowed). Profiles already linked to an account take its email.
  const [emailIndex] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'doctors' AND INDEX_NAME = 'uq_doctors_email'`,
    [DB.database],
  );
  if (!emailIndex.length) {
    await pool.query(
      'UPDATE doctors d JOIN users u ON u.id = d.user_id SET d.email = u.email WHERE d.email IS NULL',
    );
    await pool.query('ALTER TABLE doctors ADD UNIQUE KEY uq_doctors_email (email)');
  }

  // 'missed' (patient didn't attend) was added to the appointment statuses later.
  const [[status]] = await pool.query(
    `SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'appointments' AND COLUMN_NAME = 'status'`,
    [DB.database],
  );
  if (status && !status.type.includes("'missed'")) {
    await pool.query(
      `ALTER TABLE appointments MODIFY COLUMN status
         ENUM('pending', 'confirmed', 'completed', 'missed', 'cancelled') NOT NULL DEFAULT 'pending'`,
    );
  }
}

/** Qualifications by department, as an admin would enter them; set once while empty. */
const QUALIFICATIONS = {
  cardiology: ['MBBS, MD (General Medicine), DM (Cardiology)', 'MBBS, MD (Medicine), DNB (Cardiology)', 'MBBS, MD, DM (Cardiac Electrophysiology)'],
  neurology: ['MBBS, MD (Medicine), DM (Neurology)', 'MBBS, MD (Medicine), DM (Neurology)', 'MBBS, MD (Physiology), Fellowship in Neurophysiology'],
  orthopedics: ['MBBS, MS (Orthopaedics), Fellowship in Joint Replacement', 'MBBS, MS (Orthopaedics), Dip. Sports Medicine', 'MBBS, MS (Orthopaedics), Fellowship in Spine Surgery'],
  pediatrics: ['MBBS, MD (Paediatrics), DCH', 'MBBS, MD (Paediatrics)', 'MBBS, MD (Paediatrics), DM (Neonatology)'],
  emergency: ['MBBS, MD (Emergency Medicine), ATLS', 'MBBS, DNB (Emergency Medicine), ACLS', 'MBBS, MD (Anaesthesiology), Fellowship in Critical Care'],
  'general-medicine': ['MBBS, MD (General Medicine)', 'MBBS, MD (General Medicine)', 'MBBS, DNB (Family Medicine)'],
};

/**
 * Gives every doctor without an email one built from their name, e.g. "Dr. Ravi Menon" →
 * ravimenon@medpoint.com. A number is appended if that email is already used by another
 * doctor or account. Signing up (or signing in) with it links the account (doctors.user_id).
 * Only fills empty emails, so the admin's edits are never overwritten.
 */
async function seedDoctorEmails() {
  const [doctors] = await pool.query('SELECT id, name FROM doctors WHERE email IS NULL ORDER BY id');
  for (const doc of doctors) {
    const base =
      doc.name
        .replace(/^dr\.?\s+/i, '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[^a-z]/g, '') || `doctor${doc.id}`;
    for (let n = 0; ; n++) {
      const email = `${base}${n || ''}@medpoint.com`;
      const [[taken]] = await pool.query(
        `SELECT (SELECT COUNT(*) FROM doctors WHERE email = ?) + (SELECT COUNT(*) FROM users WHERE email = ?) AS c`,
        [email, email],
      );
      if (!Number(taken.c)) {
        await pool.query('UPDATE doctors SET email = ? WHERE id = ? AND email IS NULL', [email, doc.id]);
        break;
      }
    }
  }
  if (doctors.length) console.log(`Set name-based emails for ${doctors.length} doctors.`);
}

async function seedDoctorDetails() {
  const [doctors] = await pool.query(
    `SELECT d.id, dep.slug FROM doctors d JOIN departments dep ON dep.id = d.department_id
      WHERE d.qualifications IS NULL ORDER BY dep.id, d.id`,
  );
  const perDept = {};
  for (const doc of doctors) {
    const i = (perDept[doc.slug] = (perDept[doc.slug] ?? -1) + 1);
    const list = QUALIFICATIONS[doc.slug] ?? ['MBBS'];
    await pool.query('UPDATE doctors SET qualifications = ?, registration_no = ? WHERE id = ?', [
      list[i % list.length],
      `MPR-${String(20400 + doc.id).padStart(6, '0')}`,
      doc.id,
    ]);
  }
}

// Weekly patterns handed out to each department's doctors in turn (0 = Sunday).
const AVAILABILITY_PATTERNS = [
  { days: [1, 3, 5], start: '09:00', end: '13:00' },
  { days: [2, 4, 6], start: '10:00', end: '14:00' },
  { days: [1, 2, 4], start: '14:00', end: '18:00' },
];

/** Gives every doctor weekly consulting hours, once, while doctor_availability is empty. */
async function seedAvailability() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM doctor_availability');
  if (count > 0) return;

  const [doctors] = await pool.query(
    `SELECT d.id, dep.slug, dep.hours FROM doctors d
       JOIN departments dep ON dep.id = d.department_id
      ORDER BY dep.id, d.id`,
  );
  const rows = [];
  const perDept = {};
  for (const doc of doctors) {
    const i = (perDept[doc.slug] = (perDept[doc.slug] ?? -1) + 1);
    if (doc.slug === 'emergency') {
      // Emergency runs 24/7; each doctor covers a shift every day.
      const shifts = [['08:00', '14:00'], ['14:00', '20:00'], ['10:00', '16:00']];
      const [start, end] = shifts[i % shifts.length];
      for (let day = 0; day < 7; day++) rows.push([doc.id, day, start, end]);
      continue;
    }
    const { days, start, end } = AVAILABILITY_PATTERNS[i % AVAILABILITY_PATTERNS.length];
    const weekdaysOnly = doc.hours.startsWith('Mon–Fri');
    for (const day of days) if (!(weekdaysOnly && day === 6)) rows.push([doc.id, day, start, end]);
  }
  if (rows.length) {
    await pool.query(
      'INSERT INTO doctor_availability (doctor_id, day_of_week, start_time, end_time) VALUES ?',
      [rows],
    );
    console.log(`Seeded consulting hours for ${doctors.length} doctors.`);
  }
}

async function seed() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM departments');
  if (count > 0) return;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const d of seedDepartments) {
      const [res] = await conn.query(
        `INSERT INTO departments (slug, name, tagline, description, icon, hours, accent_from, accent_to)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.slug, d.name, d.tagline, d.description, d.icon, d.hours, d.accent[0], d.accent[1]],
      );
      const deptId = res.insertId;
      for (const service of d.services) {
        await conn.query('INSERT INTO department_services (department_id, name) VALUES (?, ?)', [
          deptId,
          service,
        ]);
      }
      for (const [name, title, experience, intro, image] of d.doctors) {
        await conn.query(
          `INSERT INTO doctors (department_id, name, title, experience_years, intro, image_url)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [deptId, name, title, experience, intro, image],
        );
      }
    }
    await conn.commit();
    console.log(`Seeded ${seedDepartments.length} departments with services and doctors.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, initDatabase };
