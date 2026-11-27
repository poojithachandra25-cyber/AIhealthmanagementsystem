const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', async (req, res) => {
  const { name, email, subject = '', message } = req.body ?? {};
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return res.status(400).json({ message: 'Name, email and message are required.' });
  }
  await pool.query(
    'INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)',
    [name.trim(), email.trim(), subject || null, message.trim()],
  );
  res.status(201).json({ message: 'Thanks! Our team will get back to you shortly.' });
});

router.get('/', requireAuth, requireRole('admin'), async (_req, res) => {
  const [messages] = await pool.query(
    'SELECT id, name, email, subject, message, created_at AS createdAt FROM contact_messages ORDER BY id DESC',
  );
  res.json({ messages });
});

module.exports = router;
