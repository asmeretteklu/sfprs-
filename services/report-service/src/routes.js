// ============================================================
// Report Service — Routes
// ============================================================
'use strict';

const express    = require('express');
const router     = express.Router();
const pdfReport  = require('./pdfReport');
const csvReport  = require('./csvReport');
const { authenticateJWT, requireRole } = require('./authMiddleware');

const ADMIN_FINANCE = ['super_admin', 'finance_officer'];

router.get('/enrollment/pdf',      authenticateJWT, requireRole(...ADMIN_FINANCE), pdfReport.enrollmentReport);
router.get('/financial/pdf',       authenticateJWT, requireRole(...ADMIN_FINANCE), pdfReport.financialReport);
router.get('/audit/pdf',           authenticateJWT, requireRole('super_admin'),    pdfReport.auditReport);

router.get('/enrollment/csv',      authenticateJWT, requireRole(...ADMIN_FINANCE), csvReport.enrollmentCSV);
router.get('/financial/csv',       authenticateJWT, requireRole(...ADMIN_FINANCE), csvReport.financialCSV);
router.get('/payments-daily/csv',  authenticateJWT, requireRole(...ADMIN_FINANCE), csvReport.dailyPaymentsCSV);
router.get('/audit/csv',           authenticateJWT, requireRole('super_admin'),    csvReport.auditCSV);

module.exports = router;
