// ============================================================
// Student Service — Routes (Extended)
// ============================================================
'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('./controller');
const { upload } = require('./upload');
const { body, param } = require('express-validator');

// Auth middleware — lightweight local JWT verifier
const { authenticateJWT, requireRole } = require('./authMiddleware');

// ── Validation ────────────────────────────────────────────────
const regValidation = [
  body('applicantFirstName').trim().notEmpty().withMessage('First name required'),
  body('applicantLastName').trim().notEmpty().withMessage('Last name required'),
  body('applicantPhone').trim().isMobilePhone().withMessage('Valid phone required'),
  body('departmentId').notEmpty().withMessage('Department required'),
  body('courseId').notEmpty().withMessage('Course required'),
  body('academicYearId').notEmpty().withMessage('Academic year required'),
];

// ── Public reference data ─────────────────────────────────────
router.get('/departments',    controller.getDepartments);
router.get('/courses',        controller.getCourses);
router.get('/academic-years', controller.getAcademicYears);

// ── Public registration ───────────────────────────────────────
router.post(
  '/registrations',
  upload.fields([
    { name: 'idDocument', maxCount: 1 },
    { name: 'certificate', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ]),
  regValidation,
  controller.submitRegistration
);
router.get('/registrations/track/:reference', controller.trackRegistration);

// ── Authenticated (student) ────────────────────────────────────
router.get('/me',         authenticateJWT, requireRole('student'), controller.getMyProfile);
router.get('/me/status',  authenticateJWT, requireRole('student'), controller.getMyStatus);

// ── Registrar ─────────────────────────────────────────────────
router.get('/registrations',               authenticateJWT, requireRole('registrar', 'super_admin'), controller.listRegistrations);
router.get('/registrations/:id',           authenticateJWT, requireRole('registrar', 'super_admin'), controller.getRegistration);
router.patch('/registrations/:id/approve', authenticateJWT, requireRole('registrar', 'super_admin'), controller.approveRegistration);
router.patch('/registrations/:id/reject',  authenticateJWT, requireRole('registrar', 'super_admin'), controller.rejectRegistration);

// ── Dashboard stats ───────────────────────────────────────────
router.get('/dashboard-stats', authenticateJWT, requireRole('registrar', 'super_admin'), controller.getDashboardStats);

// ── Admin / Registrar ─────────────────────────────────────────
router.get('/list',       authenticateJWT, requireRole('registrar', 'finance_officer', 'super_admin'), controller.listStudents);
router.get('/:studentId', authenticateJWT, requireRole('registrar', 'finance_officer', 'super_admin'), controller.getStudent);

module.exports = router;
