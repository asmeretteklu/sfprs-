// ============================================================
// Auth Service — Entry Point (Hardened)
// SFPRS · Microlink IT College · Port :3001
// ============================================================
'use strict';

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const routes       = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Security headers (helmet) ────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,      // Allow inline scripts for client pages
  crossOriginEmbedderPolicy: false,
}));
app.disable('x-powered-by');

// ── CORS ─────────────────────────────────────────────────────
app.use(cors({
  origin:      process.env.CLIENT_ORIGIN || 'http://localhost:5500',
  credentials: true,
}));

// ── Body parsing with size limits ────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

// ── Request logging ──────────────────────────────────────────
app.use(morgan('combined'));

// ── Global rate limiter (100 req / 15 min per IP) ────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'TooManyRequests', message: 'Too many requests. Please try again later.' },
});
app.use(globalLimiter);

// ── Login-specific rate limiter (5 attempts / 15 min) ────────
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max:      parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'TooManyLoginAttempts', message: 'Too many login attempts. Please wait 15 minutes before trying again.' },
  keyGenerator: (req) => req.ip + ':login',
});
app.use('/auth/login', loginLimiter);

// ── Custom security headers ──────────────────────────────────
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// ── Routes ────────────────────────────────────────────────────
app.use('/auth', routes);

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ service: 'auth-service', status: 'ok', ts: new Date().toISOString() });
});

// ── 404 ───────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[auth-service error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[auth-service] Running on port ${PORT}`);
});

module.exports = app;
