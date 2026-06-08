// ============================================================
// Finance Service — Controller
// Payment engine · MLKFEE-YYYY-NNNN receipts · Audit logging
// ============================================================
'use strict';

const mysql   = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path    = require('path');
const fs      = require('fs');
const { generateReceiptPDF } = require('./receiptGen');

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

async function audit(db, actorId, role, action, entityType, entityId, req, oldVal, newVal) {
  try {
    await db.execute(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [actorId, role, action, entityType, entityId,
       oldVal ? JSON.stringify(oldVal) : null,
       newVal ? JSON.stringify(newVal) : null,
       req.ip || req.connection?.remoteAddress,
       req.headers['user-agent'] || null]
    );
  } catch (e) { console.error('[audit]', e.message); }
}

// ============================================================
// GET /api/finance/fees/:studentId
// ============================================================
async function getStudentFees(req, res) {
  const { studentId } = req.params;
  // Students can only view their own fees
  if (req.user.role === 'student' && req.user.id !== studentId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const db = getPool();
  try {
    // Get student info
    const [students] = await db.execute(
      `SELECT s.id, s.student_id_number, s.first_name, s.last_name,
              s.department_id, s.academic_year_id, s.current_semester, s.enrollment_status
       FROM students s WHERE (s.id = ? OR s.student_id_number = ?) AND s.deleted_at IS NULL`,
      [studentId, studentId]
    );
    if (!students.length) return res.status(404).json({ error: 'StudentNotFound' });

    const student = students[0];

    // Get applicable fee schedules
    const [schedules] = await db.execute(
      `SELECT fs.id, fs.name, fs.fee_type, fs.amount, fs.currency, fs.due_date,
              fs.semester, fs.is_mandatory,
              p.id AS payment_id, p.amount_paid, p.payment_date, p.status AS payment_status,
              r.receipt_number
       FROM   fee_schedules fs
       LEFT JOIN payments p ON p.fee_schedule_id = fs.id AND p.student_id = ? AND p.status = 'completed'
       LEFT JOIN receipts r ON r.payment_id = p.id
       WHERE  fs.academic_year_id = ?
         AND  (fs.department_id IS NULL OR fs.department_id = ?)
         AND  fs.deleted_at IS NULL
       ORDER BY fs.semester, fs.fee_type`,
      [student.id, student.academic_year_id, student.department_id]
    );

    // Flag overdue and unpaid
    const now = new Date();
    let totalDue = 0;
    let totalPaid = 0;
    const enriched = schedules.map(s => {
      const paid    = !!s.payment_id;
      const overdue = !paid && new Date(s.due_date) < now;
      if (!paid && s.is_mandatory) totalDue += parseFloat(s.amount);
      if (paid) totalPaid += parseFloat(s.amount_paid);
      return { ...s, paid, overdue };
    });

    // Check enrollment block
    const hasOverdueMandatory = enriched.some(s => s.overdue && s.is_mandatory);

    return res.json({
      student: {
        id:              student.id,
        studentIdNumber: student.student_id_number,
        name:            `${student.first_name} ${student.last_name}`,
        enrollmentStatus: student.enrollment_status,
        semesterBlocked: hasOverdueMandatory,
      },
      feeSchedules: enriched,
      summary: {
        totalDue:  parseFloat(totalDue.toFixed(2)),
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        balance:   parseFloat((totalDue - totalPaid).toFixed(2)),
      },
    });
  } catch (err) {
    console.error('[getStudentFees]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// POST /api/finance/payments  — finance officer
// ============================================================
async function recordPayment(req, res) {
  const {
    studentId, feeScheduleId, amountPaid, paymentMethod,
    bankReference, semester, academicYearId, notes,
  } = req.body;

  if (!studentId || !feeScheduleId || !amountPaid) {
    return res.status(400).json({ error: 'MissingFields', message: 'studentId, feeScheduleId, amountPaid required.' });
  }

  const db = getPool();
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verify student exists and is not deleted
    const [students] = await conn.execute(
      `SELECT id, first_name, last_name, department_id, academic_year_id FROM students
       WHERE (id = ? OR student_id_number = ?) AND deleted_at IS NULL`,
      [studentId, studentId]
    );
    if (!students.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'StudentNotFound' });
    }
    const student = students[0];

    // Check for duplicate payment
    const [existing] = await conn.execute(
      `SELECT id FROM payments WHERE student_id = ? AND fee_schedule_id = ? AND status = 'completed'`,
      [student.id, feeScheduleId]
    );
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'AlreadyPaid', message: 'This fee has already been paid.' });
    }

    // Generate receipt number: MLKFEE-YYYY-NNNN
    const year = new Date().getFullYear();
    const [[{ rcnt }]] = await conn.execute(
      `SELECT COUNT(*) AS rcnt FROM receipts WHERE YEAR(issued_at) = ?`, [year]
    );
    const receiptNum = `MLKFEE-${year}-${String(parseInt(rcnt) + 1).padStart(4, '0')}`;

    const paymentId = uuidv4();
    const officerIp = req.ip || req.connection?.remoteAddress;

    // Insert payment
    await conn.execute(
      `INSERT INTO payments
         (id, student_id, fee_schedule_id, amount_paid, payment_method, bank_reference,
          semester, academic_year_id, officer_id, officer_ip, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
      [paymentId, student.id, feeScheduleId, parseFloat(amountPaid),
       paymentMethod || 'cash', bankReference || null,
       parseInt(semester) || 1, academicYearId,
       req.user.id, officerIp, notes || null]
    );

    // Get fee schedule details for receipt
    const [feeRows] = await conn.execute(
      `SELECT name, fee_type, amount, currency FROM fee_schedules WHERE id = ?`, [feeScheduleId]
    );
    const fee = feeRows[0];

    // Generate PDF receipt
    const receiptDir = path.join(__dirname, '..', 'receipts');
    if (!fs.existsSync(receiptDir)) fs.mkdirSync(receiptDir, { recursive: true });
    const pdfPath    = path.join(receiptDir, `${receiptNum}.pdf`);
    const pdfRelUrl  = `/receipts/pdf/${receiptNum}.pdf`;

    await generateReceiptPDF({
      receiptNumber: receiptNum,
      student:       { id: student.id, name: `${student.first_name} ${student.last_name}` },
      fee:           { name: fee?.name, type: fee?.fee_type, amount: parseFloat(amountPaid), currency: fee?.currency || 'ETB' },
      paymentMethod: paymentMethod || 'cash',
      officerName:   `${req.user.firstName} ${req.user.lastName}`,
      pdfPath,
    });

    // Insert receipt record
    await conn.execute(
      `INSERT INTO receipts (id, receipt_number, payment_id, student_id, pdf_url, issued_by)
       VALUES (UUID(), ?, ?, ?, ?, ?)`,
      [receiptNum, paymentId, student.id, pdfRelUrl, req.user.id]
    );

    // Audit log
    await audit(conn, req.user.id, req.user.role, 'PAYMENT_RECORDED', 'payments', paymentId, req,
      null,
      { studentId: student.id, feeScheduleId, amountPaid, receiptNum, officerIp }
    );

    await conn.commit();

    return res.status(201).json({
      message: 'Payment recorded successfully.',
      paymentId,
      receiptNumber: receiptNum,
      receiptUrl:    pdfRelUrl,
    });
  } catch (err) {
    await conn.rollback();
    console.error('[recordPayment]', err);
    return res.status(500).json({ error: 'InternalError', message: 'Payment recording failed.' });
  } finally {
    conn.release();
  }
}

// ============================================================
// GET /api/finance/payments
// ============================================================
async function listPayments(req, res) {
  const { studentId, startDate, endDate, page = 1, limit = 20 } = req.query;
  const safeLimit  = Math.min(Math.max(parseInt(limit) || 20, 1), 100);
  const safeOffset = Math.max((Math.max(parseInt(page) || 1, 1) - 1) * safeLimit, 0);
  const db = getPool();
  try {
    let where = 'p.deleted_at IS NULL';
    const params = [];
    if (studentId) { where += ' AND (s.id = ? OR s.student_id_number = ?)'; params.push(studentId, studentId); }
    if (startDate) { where += ' AND p.payment_date >= ?'; params.push(startDate); }
    if (endDate)   { where += ' AND p.payment_date <= ?'; params.push(endDate + ' 23:59:59'); }

    const [rows] = await db.execute(
      `SELECT p.id, p.amount_paid, p.payment_method, p.payment_date, p.status,
              s.student_id_number, s.first_name, s.last_name,
              fs.name AS fee_name, fs.fee_type,
              r.receipt_number,
              u.first_name AS officer_first, u.last_name AS officer_last
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       LEFT JOIN users u ON u.id = p.officer_id
       WHERE  ${where}
       ORDER BY p.payment_date DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );
    const [[{ total }]] = await db.execute(
      `SELECT COUNT(*) AS total FROM payments p
       JOIN students s ON s.id = p.student_id WHERE ${where}`, params
    );
    return res.json({ data: rows, total, page: parseInt(page) });
  } catch (err) {
    console.error('[listPayments]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/payments/:id
// ============================================================
async function getPayment(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT p.*, s.student_id_number, s.first_name, s.last_name,
              fs.name AS fee_name, fs.fee_type, fs.currency,
              r.receipt_number, r.pdf_url,
              u.first_name AS officer_first, u.last_name AS officer_last
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       LEFT JOIN users u ON u.id = p.officer_id
       WHERE  p.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'NotFound' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[getPayment]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/receipts/:paymentId
// ============================================================
async function getReceipt(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT r.*, s.student_id_number, s.first_name, s.last_name,
              p.amount_paid, p.payment_method, p.payment_date,
              fs.name AS fee_name, fs.fee_type, fs.currency
       FROM   receipts r
       JOIN   payments p ON p.id = r.payment_id
       JOIN   students s ON s.id = r.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       WHERE  (r.payment_id = ? OR r.receipt_number = ?) AND r.voided = 0`,
      [req.params.paymentId, req.params.paymentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'ReceiptNotFound' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[getReceipt]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/receipts/:paymentId/download
// ============================================================
async function downloadReceipt(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT receipt_number, pdf_url FROM receipts WHERE (payment_id = ? OR receipt_number = ?) AND voided = 0`,
      [req.params.paymentId, req.params.paymentId]
    );
    if (!rows.length) return res.status(404).json({ error: 'ReceiptNotFound' });
    const pdfPath = path.join(__dirname, '..', 'receipts', `${rows[0].receipt_number}.pdf`);
    if (!fs.existsSync(pdfPath)) return res.status(404).json({ error: 'PDFNotFound' });
    res.download(pdfPath, `${rows[0].receipt_number}.pdf`);
  } catch (err) {
    console.error('[downloadReceipt]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/dashboard
// ============================================================
async function getDashboard(req, res) {
  const db = getPool();
  try {
    const today = new Date().toISOString().slice(0, 10);

    const [[todayStats]] = await db.execute(
      `SELECT COALESCE(SUM(amount_paid),0) AS today_total,
              COUNT(*) AS today_count
       FROM payments WHERE DATE(payment_date) = ? AND status = 'completed'`,
      [today]
    );

    const [[monthStats]] = await db.execute(
      `SELECT COALESCE(SUM(amount_paid),0) AS month_total,
              COUNT(*) AS month_count
       FROM payments
       WHERE YEAR(payment_date) = YEAR(NOW()) AND MONTH(payment_date) = MONTH(NOW())
         AND status = 'completed'`
    );

    const [[overdueStats]] = await db.execute(
      `SELECT COUNT(DISTINCT s.id) AS overdue_students
       FROM students s
       JOIN fee_schedules fs ON (fs.department_id IS NULL OR fs.department_id = s.department_id)
         AND fs.academic_year_id = s.academic_year_id
         AND fs.is_mandatory = 1
         AND fs.due_date < CURDATE()
       LEFT JOIN payments p ON p.student_id = s.id AND p.fee_schedule_id = fs.id AND p.status = 'completed'
       WHERE p.id IS NULL AND s.deleted_at IS NULL`
    );

    const [recentPayments] = await db.execute(
      `SELECT p.id, p.amount_paid, p.payment_date, p.payment_method,
              s.student_id_number, s.first_name, s.last_name, r.receipt_number
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       WHERE  p.status = 'completed'
       ORDER BY p.payment_date DESC LIMIT 10`
    );

    return res.json({
      today:   { total: parseFloat(todayStats.today_total), count: todayStats.today_count },
      month:   { total: parseFloat(monthStats.month_total), count: monthStats.month_count },
      overdue: { students: overdueStats.overdue_students },
      recentPayments,
    });
  } catch (err) {
    console.error('[getDashboard]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/overdue
// ============================================================
async function getOverdue(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT s.id, s.student_id_number, s.first_name, s.last_name,
              s.phone, s.email, s.current_semester,
              d.name AS department,
              GROUP_CONCAT(fs.name SEPARATOR ', ') AS overdue_fees,
              SUM(fs.amount) AS total_overdue
       FROM   students s
       JOIN   departments d ON d.id = s.department_id
       JOIN   fee_schedules fs ON (fs.department_id IS NULL OR fs.department_id = s.department_id)
         AND fs.academic_year_id = s.academic_year_id
         AND fs.is_mandatory = 1
         AND fs.due_date < CURDATE()
       LEFT JOIN payments p ON p.student_id = s.id AND p.fee_schedule_id = fs.id AND p.status = 'completed'
       WHERE  p.id IS NULL AND s.deleted_at IS NULL AND s.enrollment_status = 'active'
       GROUP BY s.id
       ORDER BY total_overdue DESC`
    );
    return res.json({ data: rows, total: rows.length });
  } catch (err) {
    console.error('[getOverdue]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/ledger
// ============================================================
async function getLedger(req, res) {
  const { startDate, endDate, feeType, page = 1, limit = 50 } = req.query;
  const safeLimit  = Math.min(Math.max(parseInt(limit) || 50, 1), 200);
  const safeOffset = Math.max((Math.max(parseInt(page) || 1, 1) - 1) * safeLimit, 0);
  const db = getPool();
  try {
    let where = 'p.deleted_at IS NULL AND p.status = \'completed\'';
    const params = [];
    if (startDate) { where += ' AND p.payment_date >= ?'; params.push(startDate); }
    if (endDate)   { where += ' AND p.payment_date <= ?'; params.push(endDate + ' 23:59:59'); }
    if (feeType)   { where += ' AND fs.fee_type = ?'; params.push(feeType); }

    const [rows] = await db.execute(
      `SELECT p.id, p.amount_paid, p.payment_method, p.payment_date, p.bank_reference,
              s.student_id_number, s.first_name, s.last_name,
              fs.name AS fee_name, fs.fee_type, fs.currency,
              r.receipt_number,
              u.first_name AS officer_first, u.last_name AS officer_last,
              p.officer_ip
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       LEFT JOIN users u ON u.id = p.officer_id
       WHERE  ${where}
       ORDER BY p.payment_date DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );
    const [[{ total, grand_total }]] = await db.execute(
      `SELECT COUNT(*) AS total, COALESCE(SUM(p.amount_paid),0) AS grand_total
       FROM payments p
       JOIN students s ON s.id = p.student_id
       JOIN fee_schedules fs ON fs.id = p.fee_schedule_id
       WHERE ${where}`, params
    );
    return res.json({
      data: rows,
      total: parseInt(total),
      grandTotal: parseFloat(grand_total),
      page: parseInt(page),
    });
  } catch (err) {
    console.error('[getLedger]', err);
    return res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/finance/schedules & POST
// ============================================================
async function listFeeSchedules(req, res) {
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT fs.*, d.name AS department_name, c.name AS course_name, a.label AS academic_year
       FROM fee_schedules fs
       LEFT JOIN departments d ON d.id = fs.department_id
       LEFT JOIN courses c ON c.id = fs.course_id
       JOIN academic_years a ON a.id = fs.academic_year_id
       WHERE fs.deleted_at IS NULL
       ORDER BY a.label DESC, fs.semester, fs.fee_type`
    );
    return res.json({ data: rows });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

async function createFeeSchedule(req, res) {
  const { name, departmentId, courseId, academicYearId, semester, feeType, amount, dueDate, isMandatory } = req.body;
  if (!name || !academicYearId || !semester || !feeType || !amount || !dueDate) {
    return res.status(400).json({ error: 'MissingFields' });
  }
  const db = getPool();
  try {
    await db.execute(
      `INSERT INTO fee_schedules (id, name, department_id, course_id, academic_year_id, semester, fee_type, amount, due_date, is_mandatory)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, departmentId || null, courseId || null, academicYearId,
       parseInt(semester), feeType, parseFloat(amount), dueDate, isMandatory ? 1 : 0]
    );
    return res.status(201).json({ message: 'Fee schedule created.' });
  } catch (err) {
    return res.status(500).json({ error: 'InternalError' });
  }
}

module.exports = {
  getStudentFees, recordPayment, listPayments, getPayment,
  getReceipt, downloadReceipt, getDashboard, getOverdue, getLedger,
  listFeeSchedules, createFeeSchedule,
};
