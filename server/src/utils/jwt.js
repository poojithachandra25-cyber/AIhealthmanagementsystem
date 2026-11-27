// JSON Web Tokens for API authentication (Specs/login.md).
// Tokens are HS256-signed with JWT_SECRET and carry standard claims:
//   sub (user id), role, name, iss, aud, iat, exp.
// Verification pins the algorithm, issuer and audience, so a token signed any other way,
// or meant for another service, is rejected.
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

const ISSUER = 'medpoint-api';
const AUDIENCE = 'medpoint-web';
const ALGORITHM = 'HS256';

/** Signs a session token for a user row or public user ({ id, role, name }). */
function signToken(user) {
  return jwt.sign({ role: user.role, name: user.name }, JWT_SECRET, {
    algorithm: ALGORITHM,
    subject: String(user.id),
    issuer: ISSUER,
    audience: AUDIENCE,
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verifies a token. Returns { id, role, name, iat, exp } or throws a jsonwebtoken error
 * (TokenExpiredError, JsonWebTokenError, NotBeforeError).
 */
function verifyToken(token) {
  const claims = jwt.verify(token, JWT_SECRET, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  const id = Number(claims.sub);
  if (!Number.isInteger(id) || id <= 0) throw new jwt.JsonWebTokenError('invalid subject');
  return { id, role: claims.role, name: claims.name, iat: claims.iat, exp: claims.exp };
}

module.exports = { signToken, verifyToken };
