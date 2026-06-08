// ============================================================
// Report Service — CSV Reports
// ============================================================
'use strict';

const { stringify } = require('csv-stringify');
const mysql         = require('mysql2/promise');

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
      connectionLimit: 5,
    });
  }
  return pool;
}

function streamCSV(res, filename, columns, data) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const stringifier = stringify({ header: true, columns });
  stringifier.pipe(res);
  data.forEach(row => stringifier.write(row));
  stringifier.end();
}

// ============================================================
// GET /api/reports/enrollment/csv
// ============================================================
async function enrollmentCSV(req, res) {
  const { academicYearId, departmentId } = req.query;
  const db = getPool();
  try {
    let where = 's.deleted_at IS NULL';
    const params = [];
    if (academicYearId) { where += ' AND s.academic_year_id = ?'; params.push(academicYearId); }
    if (departmentId)   { where += ' AND s.department_id = ?';    params.push(departmentId); }

    const [rows] = await db.execute(
      `SELECT s.student_id_number, s.first_name, s.last_name, s.phone, s.email,
              s.current_semester, s.enrollment_status, s.created_at,
              d.name AS department, d.code AS dept_code, c.name AS course, a.label AS academic_year
       FROM   students s
       JOIN   departments d ON d.id = s.department_id
       JOIN   courses c ON c.id = s.course_id
       JOIN   academic_years a ON a.id = s.academic_year_id
       WHERE  ${where}
       ORDER BY d.name, s.last_name`,
      params
    );

    const columns = [
      { key: 'student_id_number', header: 'Student ID' },
      { key: 'first_name',        header: 'First Name' },
      { key: 'last_name',         header: 'Last Name' },
      { key: 'department',        header: 'Department' },
      { key: 'course',            header: 'Course' },
      { key: 'academic_year',     header: 'Academic Year' },
      { key: 'current_semester',  header: 'Semester' },
      { key: 'enrollment_status', header: 'Status' },
      { key: 'phone',             header: 'Phone' },
      { key: 'email',             header: 'Email' },
      { key: 'created_at',        header: 'Enrolled At' },
    ];

    streamCSV(res, `enrollment-${Date.now()}.csv`, columns, rows);
  } catch (err) {
    console.error('[enrollmentCSV]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/reports/financial/csv
// ============================================================
async function financialCSV(req, res) {
  const { startDate, endDate, academicYearId } = req.query;
  const db = getPool();
  try {
    let where = 'p.status = \'completed\' AND p.deleted_at IS NULL';
    const params = [];
    if (academicYearId) { where += ' AND p.academic_year_id = ?'; params.push(academicYearId); }
    if (startDate)      { where += ' AND p.payment_date >= ?';    params.push(startDate); }
    if (endDate)        { where += ' AND p.payment_date <= ?';    params.push(endDate + ' 23:59:59'); }

    const [rows] = await db.execute(
      `SELECT p.payment_date, s.student_id_number, s.first_name, s.last_name,
              fs.name AS fee_name, fs.fee_type, p.amount_paid, p.payment_method,
              p.bank_reference, r.receipt_number, a.label AS academic_year,
              u.first_name AS officer_first, u.last_name AS officer_last, p.officer_ip
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       JOIN   academic_years a ON a.id = p.academic_year_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       LEFT JOIN users u ON u.id = p.officer_id
       WHERE  ${where}
       ORDER BY p.payment_date DESC`,
      params
    );

    const columns = [
      { key: 'payment_date',     header: 'Payment Date' },
      { key: 'receipt_number',   header: 'Receipt No.' },
      { key: 'student_id_number',header: 'Student ID' },
      { key: 'first_name',       header: 'First Name' },
      { key: 'last_name',        header: 'Last Name' },
      { key: 'fee_name',         header: 'Fee Description' },
      { key: 'fee_type',         header: 'Fee Type' },
      { key: 'amount_paid',      header: 'Amount (ETB)' },
      { key: 'payment_method',   header: 'Method' },
      { key: 'bank_reference',   header: 'Bank Reference' },
      { key: 'academic_year',    header: 'Academic Year' },
      { key: 'officer_first',    header: 'Officer First' },
      { key: 'officer_last',     header: 'Officer Last' },
      { key: 'officer_ip',       header: 'Officer IP' },
    ];

    streamCSV(res, `financial-${Date.now()}.csv`, columns, rows);
  } catch (err) {
    console.error('[financialCSV]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/reports/payments-daily/csv
// ============================================================
async function dailyPaymentsCSV(req, res) {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const db = getPool();
  try {
    const [rows] = await db.execute(
      `SELECT p.payment_date, s.student_id_number, s.first_name, s.last_name,
              fs.name AS fee_name, p.amount_paid, p.payment_method, r.receipt_number,
              u.first_name AS officer_first, u.last_name AS officer_last
       FROM   payments p
       JOIN   students s ON s.id = p.student_id
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       LEFT JOIN receipts r ON r.payment_id = p.id
       LEFT JOIN users u ON u.id = p.officer_id
       WHERE  DATE(p.payment_date) = ? AND p.status = 'completed'
       ORDER BY p.payment_date ASC`,
      [targetDate]
    );

    const columns = [
      { key: 'payment_date',      header: 'Time' },
      { key: 'receipt_number',    header: 'Receipt No.' },
      { key: 'student_id_number', header: 'Student ID' },
      { key: 'first_name',        header: 'First Name' },
      { key: 'last_name',         header: 'Last Name' },
      { key: 'fee_name',          header: 'Fee' },
      { key: 'amount_paid',       header: 'Amount (ETB)' },
      { key: 'payment_method',    header: 'Method' },
      { key: 'officer_first',     header: 'Officer' },
    ];

    streamCSV(res, `daily-payments-${targetDate}.csv`, columns, rows);
  } catch (err) {
    console.error('[dailyPaymentsCSV]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/reports/audit/csv
// ============================================================
async function auditCSV(req, res) {
  const { startDate, endDate } = req.query;
  const db = getPool();
  try {
    let where = '1=1';
    const params = [];
    if (startDate) { where += ' AND a.created_at >= ?'; params.push(startDate); }
    if (endDate)   { where += ' AND a.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [rows] = await db.execute(
      `SELECT a.created_at, a.action, a.entity_type, a.entity_id,
              a.actor_role, a.ip_address,
              u.first_name, u.last_name, u.email AS actor_email
       FROM   audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE  ${where}
       ORDER BY a.created_at DESC
       LIMIT 10000`,
      params
    );

    const columns = [
      { key: 'created_at',   header: 'Timestamp' },
      { key: 'action',       header: 'Action' },
      { key: 'entity_type',  header: 'Entity Type' },
      { key: 'entity_id',    header: 'Entity ID' },
      { key: 'first_name',   header: 'Actor First Name' },
      { key: 'last_name',    header: 'Actor Last Name' },
      { key: 'actor_email',  header: 'Actor Email' },
      { key: 'actor_role',   header: 'Role' },
      { key: 'ip_address',   header: 'IP Address' },
    ];

    streamCSV(res, `audit-log-${Date.now()}.csv`, columns, rows);
  } catch (err) {
    console.error('[auditCSV]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

module.exports = { enrollmentCSV, financialCSV, dailyPaymentsCSV, auditCSV };
