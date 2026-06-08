// ============================================================
// Auth Service — Routes (Extended)
// ============================================================
'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { authenticateJWT, requireRole } = require('./middleware');
const { body } = require('express-validator');

// ── Validation rules ──────────────────────────────────────────
const loginValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
];

const createUserValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password min 8 chars'),
  body('firstName').trim().notEmpty().withMessage('First name required'),
  body('lastName').trim().notEmpty().withMessage('Last name required'),
  body('roleId').notEmpty().withMessage('Role ID required'),
];

// ── Public routes ─────────────────────────────────────────────
router.post('/login',   loginValidation, controller.login);
router.post('/refresh', controller.refresh);

// ── Protected routes ──────────────────────────────────────────
router.post('/logout',          authenticateJWT, controller.logout);
router.get('/me',               authenticateJWT, controller.me);
router.post('/change-password', authenticateJWT, controller.changePassword);

// ── Admin user management ─────────────────────────────────────
router.get('/roles',                       authenticateJWT, requireRole('super_admin'), controller.listRoles);
router.get('/users',                       authenticateJWT, requireRole('super_admin'), controller.listUsers);
router.post('/users',                      authenticateJWT, requireRole('super_admin'), createUserValidation, controller.createUser);
router.patch('/users/:id',                 authenticateJWT, requireRole('super_admin'), controller.updateUser);
router.patch('/users/:id/toggle-active',   authenticateJWT, requireRole('super_admin'), controller.toggleUserActive);
router.patch('/users/:id/unlock',          authenticateJWT, requireRole('super_admin'), controller.unlockUser);

module.exports = router;
