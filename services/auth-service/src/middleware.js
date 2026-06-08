// ============================================================
// Auth Service — JWT Middleware & Role Guard
// ============================================================
'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';

/**
 * authenticateJWT
 * Validates the Bearer token from Authorization header OR the
 * access_token httpOnly cookie. Attaches decoded user to req.user.
 */
function authenticateJWT(req, res, next) {
  let token = null;

  // 1. Try Authorization header (Bearer)
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  }

  // 2. Fallback to httpOnly cookie
  if (!token && req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided.',
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email, role, firstName, lastName }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TokenExpired', message: 'Access token expired.' });
    }
    return res.status(401).json({ error: 'InvalidToken', message: 'Invalid authentication token.' });
  }
}

/**
 * requireRole(...roles)
 * Factory — returns middleware that allows only specified roles.
 * Usage: requireRole('finance_officer', 'super_admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' is not permitted to access this resource.`,
        required: allowedRoles,
      });
    }
    next();
  };
}

module.exports = { authenticateJWT, requireRole };
