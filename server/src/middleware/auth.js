// Bearer-token authentication for the API (JWT, see utils/jwt.js).
const { TokenExpiredError } = require('jsonwebtoken');
const { pool } = require('../db');
const { verifyToken } = require('../utils/jwt');

/**
 * Requires a valid JWT in `Authorization: Bearer <token>` and sets req.user = { id, role, name }.
 * Beyond the signature and expiry, the token is checked against the database:
 *   - the account must still exist, with the same role;
 *   - the token must have been issued after the last password change (so changing or
 *     resetting a password signs out every other session).
 * Every 401 carries a `code` the frontend uses to send the user back to Login.
 */
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ code: 'NO_TOKEN', message: 'Authentication required. Please log in.' });
  }

  let claims;
  try {
    claims = verifyToken(token);
  } catch (err) {
    const expired = err instanceof TokenExpiredError;
    return res.status(401).json({
      code: expired ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: expired ? 'Your session has expired. Please log in again.' : 'Invalid session. Please log in again.',
    });
  }

  try {
    const [[user]] = await pool.query(
      'SELECT id, role, name, UNIX_TIMESTAMP(password_changed_at) AS changedAt FROM users WHERE id = ?',
      [claims.id],
    );
    if (!user || user.role !== claims.role) {
      return res.status(401).json({ code: 'TOKEN_REVOKED', message: 'Your account has changed. Please log in again.' });
    }
    if (user.changedAt && claims.iat < Math.floor(Number(user.changedAt))) {
      return res.status(401).json({ code: 'TOKEN_REVOKED', message: 'Your password was changed. Please log in again.' });
    }
    req.user = { id: user.id, role: user.role, name: user.name };
    next();
  } catch (err) {
    next(err);
  }
}

const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ message: 'You do not have access to this resource.' });

module.exports = { requireAuth, requireRole };
