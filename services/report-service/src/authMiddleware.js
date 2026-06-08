// Report Service — Auth Middleware (local copy)
'use strict';
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_ME_IN_PRODUCTION';
function authenticateJWT(req, res, next) {
  let token = null;
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) token = h.slice(7);
  if (!token && req.cookies?.access_token) token = req.cookies.access_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}
module.exports = { authenticateJWT, requireRole };
