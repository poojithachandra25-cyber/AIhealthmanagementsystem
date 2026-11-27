const express = require('express');
const cors = require('cors');
const { PORT, DB, JWT_SECRET } = require('./config');

// Anyone who knows the JWT secret can mint tokens, so the built-in development value
// must never reach production.
if (JWT_SECRET === 'medpoint-dev-secret-change-me') {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET is not set. Refusing to start in production with the development secret.');
    process.exit(1);
  }
  console.warn('Using the development JWT secret. Set JWT_SECRET (a long random string) before deploying.');
}
const { initDatabase } = require('./db');

const app = express();
app.use(cors({ origin: ['http://localhost:4200'] }));
// Lab report uploads carry a base64 file (≤ 5 MB → ~6.7 MB of JSON); every other route keeps the small default.
app.use('/api/records/uploads', express.json({ limit: '8mb' }));
app.use(/^\/api\/doctor\/appointments\/\d+\/reports$/, express.json({ limit: '8mb' }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/records', require('./routes/records'));
app.use('/api/doctor', require('./routes/doctor-portal'));
app.use('/api/doctor', require('./routes/doctor-cases'));
app.use('/api/bills', require('./routes/bills'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/profile', require('./routes/profile'));

app.use((_req, res) => res.status(404).json({ message: 'Not found.' }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on our side.' });
});

initDatabase()
  .then(() => {
    console.log(`Connected to MySQL database "${DB.database}" on ${DB.host}:${DB.port}`);
    app.listen(PORT, () => console.log(`MedPoint API listening on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error(`Could not initialise MySQL (${DB.host}:${DB.port}/${DB.database}):`, err.message);
    process.exit(1);
  });
