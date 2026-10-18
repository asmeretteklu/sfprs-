// Finance Service — Auth Middleware (local copy)
'use strict';
const jwt = require('jsonwebtoken');
if (!process.env.JWT_SECRET) throw new Error('[finance-service] JWT_SECRET env var is required');
const JWT_SECRET = process.env.JWT_SECRET;

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
    return res.status(401).json({ error: 'Unauthorized', message: e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden', message: `Role '${req.user.role}' not permitted.` });
    next();
  };
}
module.exports = { authenticateJWT, requireRole };
