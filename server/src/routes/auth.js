const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { ROLES } = require('../config');
const { requireAuth } = require('../middleware/auth');
const { signToken } = require('../utils/jwt');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USER_COLUMNS = 'id, name, email, phone, role, specialization, created_at';

/** Maps a `users` row to the shape the frontend expects (no password hash). */
const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone ?? '',
  role: row.role,
  ...(row.specialization ? { specialization: row.specialization } : {}),
  createdAt: row.created_at,
});

const findByEmail = async (email) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [
    email.trim().toLowerCase(),
  ]);
  return rows[0];
};

// Self sign-up is open to all three roles (Specs/layout.md).
// NOTE: open admin registration is a security risk outside a demo; gate it before production.
router.post('/register', async (req, res) => {
  const { name, email, phone = '', password, role } = req.body ?? {};
  if (!name?.trim() || !email || !password || !role) {
    return res.status(400).json({ message: 'Name, email, password and role are required.' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Unknown role.' });
  if (await findByEmail(email)) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // A doctor can only sign up with the email the admin registered on their profile
    // (Specs/admindashboard.md); the account is linked to that profile.
    let specialization = null;
    let profile = null;
    if (role === 'doctor') {
      [[profile]] = await conn.query(
        `SELECT d.id, d.user_id, dep.name AS department
           FROM doctors d JOIN departments dep ON dep.id = d.department_id
          WHERE d.email = ? FOR UPDATE`,
        [email.trim().toLowerCase()],
      );
      if (!profile) {
        await conn.rollback();
        return res.status(403).json({
          message:
            "This email isn't registered for a doctor at MedPoint. Ask the hospital admin to add you, then sign up with that email.",
        });
      }
      if (profile.user_id) {
        await conn.rollback();
        return res
          .status(409)
          .json({ message: 'That doctor profile already has an account. Try logging in instead.' });
      }
      specialization = profile.department;
    }

    const [result] = await conn.query(
      `INSERT INTO users (name, email, phone, role, specialization, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name.trim(), email.trim().toLowerCase(), phone || null, role, specialization, passwordHash],
    );
    if (role === 'doctor') {
      await conn.query('UPDATE doctors SET user_id = ? WHERE id = ?', [result.insertId, profile.id]);
    }
    await conn.commit();

    const [[row]] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [
      result.insertId,
    ]);
    const user = publicUser(row);
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw err;
  } finally {
    conn.release();
  }
});

router.post('/login', async (req, res) => {
  const { email, password, role } = req.body ?? {};
  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password and role are required.' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Unknown role.' });

  const row = await findByEmail(email);
  const valid = row && (await bcrypt.compare(password, row.password_hash));
  if (!valid) return res.status(401).json({ message: 'Invalid email or password.' });
  if (row.role !== role) {
    return res.status(403).json({ message: `This account is not registered as a ${role}.` });
  }
  const user = publicUser(row);
  res.json({ token: signToken(user), user });
});

// "Forgot password" flow: set a new password for a registered email + role.
// NOTE: there is no email/OTP verification, so anyone who knows an account's email can reset it.
// Add a verification step before using this outside a demo.
router.post('/update-password', async (req, res) => {
  const { email, role, newPassword } = req.body ?? {};
  if (!email || !role || !newPassword) {
    return res.status(400).json({ message: 'Email, role and new password are required.' });
  }
  if (!ROLES.includes(role)) return res.status(400).json({ message: 'Unknown role.' });
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }
  const row = await findByEmail(email);
  if (!row || row.role !== role) {
    return res.status(404).json({ message: `No ${role} account is registered with this email.` });
  }
  // password_changed_at revokes every JWT issued before now (signs out other sessions).
  await pool.query(
    'UPDATE users SET password_hash = ?, password_changed_at = FROM_UNIXTIME(?) WHERE id = ?',
    [await bcrypt.hash(newPassword, 10), Math.floor(Date.now() / 1000), row.id],
  );
  res.json({ message: 'Password updated. You can now sign in with your new password.' });
});

router.get('/me', requireAuth, async (req, res) => {
  const [[row]] = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, [req.user.id]);
  if (!row) return res.status(404).json({ message: 'User not found.' });
  res.json({ user: publicUser(row) });
});

module.exports = router;
