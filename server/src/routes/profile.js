// Profile & Settings: the signed-in user's own details and password.
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { isoDate, parseDate } = require('../utils/schedule');
const { signToken } = require('../utils/jwt');

const router = express.Router();
router.use(requireAuth);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s-]{6,}$/;
const GENDERS = ['female', 'male', 'other'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const PROFILE_SELECT = `
  SELECT id, name, email, phone, role, specialization, created_at AS createdAt,
         DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS dateOfBirth, gender, blood_group AS bloodGroup,
         address, emergency_contact_name AS emergencyContactName,
         emergency_contact_phone AS emergencyContactPhone
    FROM users WHERE id = ?`;

async function loadProfile(id) {
  const [[row]] = await pool.query(PROFILE_SELECT, [id]);
  return row;
}

router.get('/', async (req, res) => {
  const profile = await loadProfile(req.user.id);
  if (!profile) return res.status(404).json({ message: 'User not found.' });
  res.json(profile);
});

/** Updates personal details. Every field is sent; blank optional fields are cleared. */
router.put('/', async (req, res) => {
  const body = req.body ?? {};
  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  const p = {
    name: text(body.name),
    email: text(body.email).toLowerCase(),
    phone: text(body.phone),
    dateOfBirth: text(body.dateOfBirth),
    gender: text(body.gender),
    bloodGroup: text(body.bloodGroup),
    address: text(body.address),
    emergencyContactName: text(body.emergencyContactName),
    emergencyContactPhone: text(body.emergencyContactPhone),
  };

  const problems = [];
  if (!p.name || p.name.length > 120) problems.push('Enter your name (up to 120 characters).');
  if (!EMAIL_RE.test(p.email) || p.email.length > 190) problems.push('Enter a valid email address.');
  if (p.phone && !PHONE_RE.test(p.phone)) problems.push('Enter a valid phone number.');
  if (p.dateOfBirth) {
    const dob = parseDate(p.dateOfBirth);
    if (!dob || p.dateOfBirth > isoDate() || dob.getFullYear() < 1900) {
      problems.push('Enter a valid date of birth.');
    }
  }
  if (p.gender && !GENDERS.includes(p.gender)) problems.push('Choose a gender from the list.');
  if (p.bloodGroup && !BLOOD_GROUPS.includes(p.bloodGroup)) problems.push('Choose a blood group from the list.');
  if (p.address.length > 255) problems.push('Keep the address under 255 characters.');
  if (p.emergencyContactName.length > 120) problems.push('Keep the emergency contact name under 120 characters.');
  if (p.emergencyContactPhone && !PHONE_RE.test(p.emergencyContactPhone)) {
    problems.push('Enter a valid emergency contact phone number.');
  }
  if (problems.length) return res.status(400).json({ message: problems[0], problems });

  const [taken] = await pool.query('SELECT id FROM users WHERE email = ? AND id <> ?', [p.email, req.user.id]);
  if (taken.length) return res.status(409).json({ message: 'Another account already uses this email.' });

  await pool.query(
    `UPDATE users
        SET name = ?, email = ?, phone = ?, date_of_birth = ?, gender = ?, blood_group = ?,
            address = ?, emergency_contact_name = ?, emergency_contact_phone = ?
      WHERE id = ?`,
    [
      p.name,
      p.email,
      p.phone || null,
      p.dateOfBirth || null,
      p.gender || null,
      p.bloodGroup || null,
      p.address || null,
      p.emergencyContactName || null,
      p.emergencyContactPhone || null,
      req.user.id,
    ],
  );
  res.json(await loadProfile(req.user.id));
});

/** Changes the password. Body: { currentPassword, newPassword } */
router.put('/password', async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) {
    return res.status(400).json({ message: 'The new password must be at least 6 characters.' });
  }
  const [[row]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!row || !(await bcrypt.compare(String(currentPassword ?? ''), row.password_hash))) {
    return res.status(400).json({ message: 'Your current password is incorrect.' });
  }
  // Revoke every JWT issued before now (other devices are signed out), then hand this
  // session a fresh token so the person who changed it stays signed in.
  await pool.query(
    'UPDATE users SET password_hash = ?, password_changed_at = FROM_UNIXTIME(?) WHERE id = ?',
    [await bcrypt.hash(newPassword, 10), Math.floor(Date.now() / 1000), req.user.id],
  );
  const [[user]] = await pool.query('SELECT id, role, name FROM users WHERE id = ?', [req.user.id]);
  res.json({ message: 'Password changed. Other devices have been signed out.', token: signToken(user) });
});

module.exports = router;
