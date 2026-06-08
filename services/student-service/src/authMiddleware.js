// ============================================================
// Student Service — Auth Middleware (local copy)
// Shares logic with auth-service/middleware.js
// In production, move to a shared npm package or gateway
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

function authenticateJWT(req, res, next) {
  let token = null;
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) token = authHeader.slice(7);
  if (!token && req.cookies?.access_token) token = req.cookies.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'No authentication token provided.' });
  }
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired.' : 'Invalid token.';
    return res.status(401).json({ error: 'Unauthorized', message: msg });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' cannot access this resource.`,
      });
    }
    next();
  };
}

module.exports = { authenticateJWT, requireRole };
