// ============================================================
// Report Service — Entry Point · Port :3005
// ============================================================
'use strict';

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const helmet       = require('helmet');
const routes       = require('./routes');

const app  = express();
const PORT = process.env.PORT || 3005;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5500', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan('combined'));

app.use('/api/reports', routes);
app.get('/health', (_req, res) => res.json({ service: 'report-service', status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, _req, res, _next) => {
  console.error('[report-service]', err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => console.log(`[report-service] Running on port ${PORT}`));
module.exports = app;
