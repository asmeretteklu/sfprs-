// ============================================================
// Student Service — Entry Point · Port :3002
// ============================================================
'use strict';

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const morgan  = require('morgan');
const path    = require('path');
const cookieParser = require('cookie-parser');
const helmet       = require('helmet');
const routes  = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5500', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('combined'));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

app.use('/api/students', routes);
app.get('/health', (_req, res) => res.json({ service: 'student-service', status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('[student-service]', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => console.log(`[student-service] Running on port ${PORT}`));
module.exports = app;
