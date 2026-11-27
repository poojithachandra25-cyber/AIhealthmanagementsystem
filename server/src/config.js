module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: process.env.JWT_SECRET || 'medpoint-dev-secret-change-me',
  JWT_EXPIRES_IN: '8h',
  ROLES: ['patient', 'doctor', 'admin'],
  /** GST added to every consultation bill, in percent. */
  GST_RATE: Number(process.env.GST_RATE ?? 18),
  // Local development defaults from Projectscope.md; override with env vars elsewhere.
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? 'welcome',
    database: process.env.DB_NAME || 'hospitalmanagement',
  },
};
