// ============================================================
// Finance Service — Routes
// ============================================================
'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { authenticateJWT, requireRole } = require('./authMiddleware');

// ── Fee Schedules ─────────────────────────────────────────────
router.get('/fees/:studentId',    authenticateJWT, controller.getStudentFees);
router.get('/schedules',          authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.listFeeSchedules);
router.post('/schedules',         authenticateJWT, requireRole('super_admin'), controller.createFeeSchedule);

// ── Payments ──────────────────────────────────────────────────
router.post('/payments',          authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.recordPayment);
router.get('/payments',           authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.listPayments);
router.get('/payments/:id',       authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.getPayment);

// ── Receipts ──────────────────────────────────────────────────
router.get('/receipts',             authenticateJWT, controller.listReceipts);
router.get('/receipts/:paymentId', authenticateJWT, controller.getReceipt);
router.get('/receipts/:paymentId/download', authenticateJWT, controller.downloadReceipt);

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard',          authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.getDashboard);
router.get('/overdue',            authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.getOverdue);
router.get('/ledger',             authenticateJWT, requireRole('finance_officer', 'super_admin'), controller.getLedger);

module.exports = router;
