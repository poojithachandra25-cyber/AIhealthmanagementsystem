// Secrets come only from the environment (server/.env locally; see .env.example).
function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`Missing ${name}. Copy server/.env.example to server/.env and fill it in.`);
    process.exit(1);
  }
  return value;
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET: required('JWT_SECRET'),
  JWT_EXPIRES_IN: '8h',
  ROLES: ['patient', 'doctor', 'admin'],
  /** GST added to every consultation bill, in percent. */
  GST_RATE: Number(process.env.GST_RATE ?? 18),
  // Non-secret defaults from Projectscope.md; override with env vars elsewhere.
  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: required('DB_PASSWORD'),
    database: process.env.DB_NAME || 'hospitalmanagement',
  },
};
