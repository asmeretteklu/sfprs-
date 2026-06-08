// ============================================================
// Student Service — Controller
// ============================================================
'use strict';

const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const { validationResult } = require('express-validator');
const path = require('path');

let pool;
function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'sfprs_db',
      waitForConnections: true,
      connectionLimit: 10,
    });
  }
  return pool;
}

// Generate reference number: MLK-REG-YYYY-NNNN
async function generateRefNumber(db) {
  const year = new Date().getFullYear();
  const [[{ count }]] = await db.execute(
    `SELECT COUNT(*) AS count FROM registrations WHERE YEAR(created_at) = ?`, [year]
  );
  const seq = String(parseInt(count) + 1).padStart(4, '0');
  return `MLK-REG-${year}-${seq}`;
}

// Audit log helper
async function audit(db, actorId, role, action, entityType, entityId, req, oldVal, newVal) {
  await db.execute(
    `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [actorId, role, action, entityType, entityId,
     oldVal ? JSON.stringify(oldVal) : null,
     newVal ? JSON.stringify(newVal) : null,
     req.ip, req.headers['user-agent'] || null]
  );
}

// ============================================================
// POST /api/students/registrations  — public
// ============================================================
async function submitRegistration(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'ValidationError', fields: errors.array() });
  }

  const {
    applicantFirstName, applicantLastName, applicantPhone, applicantEmail,
    departmentId, courseId, academicYearId,
  } = req.body;

  const files = req.files || {};
  const idUrl   = files.idDocument  ? `/uploads/${files.idDocument[0].filename}`  : null;
  const certUrl = files.certificate ? `/uploads/${files.certificate[0].filename}` : null;
  const photoUrl= files.photo       ? `/uploads/${files.photo[0].filename}`       : null;

  const db = getPool();
  try {
    const ref = await generateRefNumber(db);
    await db.execute(
      `INSERT INTO registrations
         (id, reference_number, applicant_first_name, applicant_last_name,
          applicant_phone, applicant_email, department_id, course_id,
          academic_year_id, document_id_url, document_cert_url, document_photo_url)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ref, applicantFirstName, applicantLastName, applicantPhone, applicantEmail || null,
       departmentId, courseId, academicYearId, idUrl, certUrl, photoUrl]
    );

    // Trigger email notification (async, non-blocking)
    notifyNewRegistration(ref, applicantFirstName, applicantEmail).catch(console.error);

    return res.status(201).json({
      message: 'Registration submitted successfully.',
      referenceNumber: ref,
    });
  } catch (err) {
    console.error('[submitRegistration]', err);
    return res.status(500).json({ error: 'InternalError', message: 'Registration failed.' });
  }
}

async function notifyNewRegistration(ref, name, email) {
  if (!email) return;
  // Call notification service
  try {
    const axios = require('axios');
    await axios.post(`${process.env.NOTIFY_SERVICE_URL || 'http://localhost:3004'}/api/notify/registration`, {
      referenceNumber: ref, name, email,
    });
  } catch (e) {
    console.warn('[notify] Could not send confirmation email:', e.message);
  }
}

// ============================================================
// GET /api/students/registrations/track/:reference  — public
// ============================================================
async function trackRegistration(req, res) {
  const { reference } = req.params;
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT r.reference_number, r.status, r.applicant_first_name, r.applicant_last_name,
              r.created_at, r.reviewed_at, r.rejection_reason,
              d.name AS department, c.name AS course, a.label AS academic_year
       FROM   registrations r
       JOIN   departments d ON d.id = r.department_id
       JOIN   courses c ON c.id = r.course_id
       JOIN   academic_years a ON a.id = r.academic_year_id
       WHERE  r.reference_number = ? AND r.deleted_at IS NULL`,
      [reference]
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound', message: 'Registration not found.' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[trackRegistration]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/registrations  — registrar
// ============================================================
async function listRegistrations(req, res) {
  const { status, page = 1, limit = 20 } = req.query;
  const safeLimit  = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safeOffset = Math.max((Math.max(parseInt(page) || 1, 1) - 1) * safeLimit, 0);
  const db = getPool();
  try {
    let where = 'r.deleted_at IS NULL';
    const params = [];
    if (status) { where += ' AND r.status = ?'; params.push(status); }

    const [rows] = await db.execute(
      `SELECT r.id, r.reference_number, r.applicant_first_name, r.applicant_last_name,
              r.applicant_phone, r.applicant_email, r.status, r.created_at,
              r.document_id_url, r.document_cert_url, r.document_photo_url,
              r.rejection_reason, r.reviewed_at,
              d.name AS department, c.name AS course
       FROM   registrations r
       JOIN   departments d ON d.id = r.department_id
       JOIN   courses c ON c.id = r.course_id
       WHERE  ${where}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM registrations r WHERE ${where}`, params
    );
    return res.json({ data: rows, total, page: parseInt(page), limit: safeLimit });
  } catch (err) {
    console.error('[listRegistrations]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/registrations/:id  — registrar
// ============================================================
async function getRegistration(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT r.*, d.name AS department, c.name AS course, a.label AS academic_year
       FROM registrations r
       JOIN departments d ON d.id = r.department_id
       JOIN courses c ON c.id = r.course_id
       JOIN academic_years a ON a.id = r.academic_year_id
       WHERE r.id = ? AND r.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[getRegistration]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// PATCH /api/students/registrations/:id/approve  — registrar
// ============================================================
async function approveRegistration(req, res) {
  const db = getPool();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [regs] = await conn.execute(
      `SELECT * FROM registrations WHERE id = ? AND deleted_at IS NULL`, [req.params.id]
    );
    if (!regs.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'NotFound' });
    }
    const reg = regs[0];
    if (reg.status !== 'submitted' && reg.status !== 'under_review') {
      await conn.rollback();
      return res.status(400).json({ error: 'InvalidStatus', message: `Cannot approve registration in status: ${reg.status}` });
    }

    // Generate student ID number: MLK-YYYY-NNN
    const year = new Date().getFullYear();
    const [[{ cnt }]] = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM students WHERE YEAR(created_at) = ?`, [year]
    );
    const studentIdNum = `MLK-${year}-${String(parseInt(cnt) + 1).padStart(4, '0')}`;

    // Create student record
    const studentId = uuidv4();
    await conn.execute(
      `INSERT INTO students
         (id, student_id_number, first_name, last_name, date_of_birth, gender, phone, email,
          department_id, course_id, academic_year_id, enrollment_status)
       VALUES (?, ?, ?, ?, '2000-01-01', 'male', ?, ?, ?, ?, ?, 'active')`,
      [studentId, studentIdNum,
       reg.applicant_first_name, reg.applicant_last_name,
       reg.applicant_phone, reg.applicant_email,
       reg.department_id, reg.course_id, reg.academic_year_id]
    );

    // Update registration
    await conn.execute(
      `UPDATE registrations SET status = 'approved', student_id = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [studentId, req.user.id, req.params.id]
    );

    await audit(conn, req.user.id, req.user.role, 'REGISTRATION_APPROVED', 'registrations',
      req.params.id, req, { status: reg.status }, { status: 'approved', studentId });

    await conn.commit();
    return res.json({
      message: 'Registration approved.',
      studentId,
      studentIdNumber: studentIdNum,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[approveRegistration]', err);
    return res.status(500).json({ error: 'InternalError' });
  } finally {
    conn.release();
  }
}

// ============================================================
// PATCH /api/students/registrations/:id/reject  — registrar
// ============================================================
async function rejectRegistration(req, res) {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'ReasonRequired', message: 'Rejection reason is required.' });

  const db = getPool();
  try {
    await db.execute(
      `UPDATE registrations SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = NOW()
       WHERE id = ? AND deleted_at IS NULL`,
      [reason, req.user.id, req.params.id]
    );
    await audit(db, req.user.id, req.user.role, 'REGISTRATION_REJECTED', 'registrations', req.params.id, req, null, { reason });
    return res.json({ message: 'Registration rejected.' });
  } catch (err) {
    console.error('[rejectRegistration]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/list  — finance/registrar
// ============================================================
async function listStudents(req, res) {
  const { department, status, search, page = 1, limit = 20 } = req.query;
  const safeLimit  = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safeOffset = Math.max((Math.max(parseInt(page) || 1, 1) - 1) * safeLimit, 0);
  const db = getPool();
  try {
    let where = 's.deleted_at IS NULL';
    const params = [];
    if (department) { where += ' AND s.department_id = ?'; params.push(department); }
    if (status)     { where += ' AND s.enrollment_status = ?'; params.push(status); }
    if (search)     { where += ' AND (s.first_name LIKE ? OR s.last_name LIKE ? OR s.student_id_number LIKE ?)';
                       params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    const [rows] = await db.execute(
      `SELECT s.id, s.student_id_number, s.first_name, s.last_name, s.phone, s.email,
              s.current_semester, s.enrollment_status, s.created_at,
              d.name AS department, c.name AS course
       FROM   students s
       JOIN   departments d ON d.id = s.department_id
       JOIN   courses c ON c.id = s.course_id
       WHERE  ${where}
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM students s WHERE ${where}`, params
    );
    return res.json({ data: rows, total });
  } catch (err) {
    console.error('[listStudents]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/:studentId
// ============================================================
async function getStudent(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT s.*, d.name AS department, d.code AS dept_code, c.name AS course, a.label AS academic_year
       FROM   students s
       JOIN   departments d ON d.id = s.department_id
       JOIN   courses c ON c.id = s.course_id
       JOIN   academic_years a ON a.id = s.academic_year_id
       WHERE  (s.id = ? OR s.student_id_number = ?) AND s.deleted_at IS NULL`,
      [req.params.studentId, req.params.studentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    const student = rows[0];
    delete student.password_hash; // safety
    return res.json(student);
  } catch (err) {
    console.error('[getStudent]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

async function getMyProfile(req, res) {
  return getStudent({ ...req, params: { studentId: req.user.id } }, res);
}

async function getMyStatus(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT enrollment_status, current_semester FROM students WHERE user_id = ? AND deleted_at IS NULL`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/departments  — public reference data
// ============================================================
async function getDepartments(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT id, code, name, name_am FROM departments WHERE deleted_at IS NULL ORDER BY name`
    );
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/courses  — public reference data
// ============================================================
async function getCourses(req, res) {
  const { departmentId } = req.query;
  const db = getPool();
  try {
    let where = 'c.deleted_at IS NULL';
    const params = [];
    if (departmentId) { where += ' AND c.department_id = ?'; params.push(departmentId); }
    const [rows] = await db.execute(
      `SELECT c.id, c.code, c.name, c.department_id, c.duration_years, c.level,
              d.name AS department_name
       FROM courses c
       JOIN departments d ON d.id = c.department_id
       WHERE ${where}
       ORDER BY c.name`,
      params
    );
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/academic-years  — public reference data
// ============================================================
async function getAcademicYears(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT id, label, start_date, end_date, is_current FROM academic_years
       WHERE deleted_at IS NULL ORDER BY start_date DESC`
    );
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/students/dashboard-stats  — registrar/admin overview
// ============================================================
async function getDashboardStats(req, res) {
  const db = getPool();
  try {
    const [[{ total_students }]] = await db.execute(
      `SELECT COUNT(*) AS total_students FROM students WHERE deleted_at IS NULL`
    );
    const [[{ active_students }]] = await db.execute(
      `SELECT COUNT(*) AS active_students FROM students WHERE enrollment_status = 'active' AND deleted_at IS NULL`
    );
    const [[{ pending_registrations }]] = await db.execute(
      `SELECT COUNT(*) AS pending_registrations FROM registrations WHERE status IN ('submitted','under_review') AND deleted_at IS NULL`
    );
    const [[{ total_registrations }]] = await db.execute(
      `SELECT COUNT(*) AS total_registrations FROM registrations WHERE deleted_at IS NULL`
    );
    const [deptBreakdown] = await db.execute(
      `SELECT d.name, d.code, COUNT(s.id) AS count
       FROM departments d
       LEFT JOIN students s ON s.department_id = d.id AND s.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
       GROUP BY d.id ORDER BY count DESC`
    );
    return res.json({
      totalStudents: total_students,
      activeStudents: active_students,
      pendingRegistrations: pending_registrations,
      totalRegistrations: total_registrations,
      departmentBreakdown: deptBreakdown,
    });
  } catch (err) {
    console.error('[getDashboardStats]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

module.exports = {
  submitRegistration,
  trackRegistration,
  listRegistrations,
  getRegistration,
  approveRegistration,
  rejectRegistration,
  listStudents,
  getStudent,
  getMyProfile,
  getMyStatus,
  getDepartments,
  getCourses,
  getAcademicYears,
  getDashboardStats,
};
