// ============================================================
// Report Service — PDF Reports (PDFKit)
// Enrollment by department · Financial summary by academic year
// ============================================================
'use strict';

const PDFDocument = require('pdfkit');
const mysql       = require('mysql2/promise');

const COLORS = {
  blackBean: '#461312',
  mustard:   '#FFD95D',
  moss:      '#576238',
  eggshell:  '#F0EADC',
  champagne: '#FAE7C9',
  rose:      '#ED809D',
  claret:    '#7C1F31',
};

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

function pdfHeader(doc, title, subtitle) {
  const pageWidth  = doc.page.width;
  const margin     = doc.page.margins.left;

  // Header bar
  doc.rect(0, 0, pageWidth, 70).fill(COLORS.blackBean);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(16)
     .text('MICROLINK IT COLLEGE', margin, 14, { width: pageWidth - margin * 2 });
  doc.fillColor(COLORS.mustard).font('Helvetica').fontSize(9)
     .text('Mekelle, Tigray · Ethiopia', margin, 34, { width: pageWidth - margin * 2 });

  // Title block
  doc.fillColor(COLORS.blackBean).font('Helvetica-Bold').fontSize(14)
     .text(title, margin, 82);
  if (subtitle) {
    doc.fillColor(COLORS.moss).font('Helvetica').fontSize(10)
       .text(subtitle, margin, 100);
  }
  doc.moveTo(margin, 120).lineTo(pageWidth - margin, 120)
     .strokeColor(COLORS.rose).lineWidth(1).stroke();
  return 130; // y after header
}

function tableRow(doc, cols, y, rowW, isHeader = false, isAlt = false) {
  const margin = doc.page.margins.left;
  const bg = isHeader ? COLORS.moss : (isAlt ? COLORS.eggshell : '#FFFFFF');
  doc.rect(margin, y, rowW, 20).fill(bg);
  let x = margin + 4;
  const color = isHeader ? 'white' : '#1a1a1a';
  doc.fillColor(color).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
  cols.forEach(({ text, width }) => {
    doc.text(String(text || ''), x, y + 5, { width: width - 8, lineBreak: false });
    x += width;
  });
  return y + 20;
}

// ============================================================
// GET /api/reports/enrollment/pdf
// ============================================================
async function enrollmentReport(req, res) {
  const { academicYearId, departmentId } = req.query;
  const db = getPool();
  try {
    let where = 's.deleted_at IS NULL';
    const params = [];
    if (academicYearId) { where += ' AND s.academic_year_id = ?'; params.push(academicYearId); }
    if (departmentId)   { where += ' AND s.department_id = ?';    params.push(departmentId); }

    const [rows] = await db.execute(
      `SELECT d.name AS department, c.name AS course, s.enrollment_status,
              COUNT(*) AS total,
              SUM(s.current_semester = 1) AS sem1,
              SUM(s.current_semester = 2) AS sem2
       FROM   students s
       JOIN   departments d ON d.id = s.department_id
       JOIN   courses c ON c.id = s.course_id
       WHERE  ${where}
       GROUP BY d.name, c.name, s.enrollment_status
       ORDER BY d.name, c.name`,
      params
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="enrollment-report-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    doc.pipe(res);

    let y = pdfHeader(doc, 'ENROLLMENT REPORT',
      `Generated: ${new Date().toLocaleDateString('en-ET', { dateStyle: 'full' })} · By: ${req.user.firstName} ${req.user.lastName}`);

    const cols = [
      { text: 'Department',  width: 140 },
      { text: 'Course',      width: 160 },
      { text: 'Status',      width: 80  },
      { text: 'Sem 1',       width: 45  },
      { text: 'Sem 2',       width: 45  },
      { text: 'Total',       width: 45  },
    ];
    const rowW = cols.reduce((s, c) => s + c.width, 0);

    y = tableRow(doc, cols, y, rowW, true);
    rows.forEach((r, i) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 80; }
      y = tableRow(doc, [
        { text: r.department,       width: 140 },
        { text: r.course,           width: 160 },
        { text: r.enrollment_status,width: 80  },
        { text: r.sem1,             width: 45  },
        { text: r.sem2,             width: 45  },
        { text: r.total,            width: 45  },
      ], y, rowW, false, i % 2 === 1);
    });

    // Grand total
    const grand = rows.reduce((s, r) => s + parseInt(r.total), 0);
    y += 8;
    doc.rect(doc.page.margins.left, y, rowW, 22).fill(COLORS.claret);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(9)
       .text(`TOTAL ENROLLED: ${grand}`, doc.page.margins.left + 4, y + 6, { width: rowW - 8 });

    doc.end();
  } catch (err) {
    console.error('[enrollmentReport]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/reports/financial/pdf
// ============================================================
async function financialReport(req, res) {
  const { academicYearId } = req.query;
  const db = getPool();
  try {
    let where = 'p.status = \'completed\' AND p.deleted_at IS NULL';
    const params = [];
    if (academicYearId) { where += ' AND p.academic_year_id = ?'; params.push(academicYearId); }

    const [rows] = await db.execute(
      `SELECT a.label AS academic_year, fs.fee_type,
              COUNT(*) AS payments, SUM(p.amount_paid) AS total_collected
       FROM   payments p
       JOIN   fee_schedules fs ON fs.id = p.fee_schedule_id
       JOIN   academic_years a ON a.id = p.academic_year_id
       WHERE  ${where}
       GROUP BY a.label, fs.fee_type
       ORDER BY a.label DESC, fs.fee_type`,
      params
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
    doc.pipe(res);

    let y = pdfHeader(doc, 'FINANCIAL SUMMARY REPORT',
      `Generated: ${new Date().toLocaleDateString('en-ET', { dateStyle: 'full' })}`);

    const cols = [
      { text: 'Academic Year', width: 120 },
      { text: 'Fee Type',      width: 120 },
      { text: 'Payments',      width: 80  },
      { text: 'Total (ETB)',   width: 120 },
    ];
    const rowW = cols.reduce((s, c) => s + c.width, 0);

    y = tableRow(doc, cols, y, rowW, true);
    let grandTotal = 0;
    rows.forEach((r, i) => {
      if (y > doc.page.height - 80) { doc.addPage(); y = 80; }
      grandTotal += parseFloat(r.total_collected);
      y = tableRow(doc, [
        { text: r.academic_year,  width: 120 },
        { text: r.fee_type,       width: 120 },
        { text: r.payments,       width: 80  },
        { text: parseFloat(r.total_collected).toLocaleString('en-ET', { minimumFractionDigits: 2 }), width: 120 },
      ], y, rowW, false, i % 2 === 1);
    });

    y += 8;
    doc.rect(doc.page.margins.left, y, rowW, 26).fill(COLORS.moss);
    doc.fillColor(COLORS.mustard).font('Helvetica-Bold').fontSize(11)
       .text(`GRAND TOTAL: ETB ${grandTotal.toLocaleString('en-ET', { minimumFractionDigits: 2 })}`,
             doc.page.margins.left + 4, y + 7, { width: rowW - 8 });

    doc.end();
  } catch (err) {
    console.error('[financialReport]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

// ============================================================
// GET /api/reports/audit/pdf
// ============================================================
async function auditReport(req, res) {
  const { startDate, endDate } = req.query;
  const db = getPool();
  try {
    let where = '1=1';
    const params = [];
    if (startDate) { where += ' AND a.created_at >= ?'; params.push(startDate); }
    if (endDate)   { where += ' AND a.created_at <= ?'; params.push(endDate + ' 23:59:59'); }

    const [rows] = await db.execute(
      `SELECT a.created_at, a.action, a.entity_type, a.actor_role, a.ip_address,
              u.first_name, u.last_name
       FROM   audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       WHERE  ${where}
       ORDER BY a.created_at DESC
       LIMIT 500`,
      params
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-log-${Date.now()}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 30, right: 30 } });
    doc.pipe(res);

    let y = pdfHeader(doc, 'AUDIT LOG REPORT',
      `${startDate || 'All time'} → ${endDate || 'Now'} · ${rows.length} entries`);

    const cols = [
      { text: 'Timestamp',   width: 120 },
      { text: 'Action',      width: 140 },
      { text: 'Entity',      width: 80  },
      { text: 'Actor',       width: 110 },
      { text: 'Role',        width: 80  },
    ];
    const rowW = cols.reduce((s, c) => s + c.width, 0);

    y = tableRow(doc, cols, y, rowW, true);
    rows.forEach((r, i) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 50; y = tableRow(doc, cols, y, rowW, true); }
      y = tableRow(doc, [
        { text: new Date(r.created_at).toLocaleString('en-ET'), width: 120 },
        { text: r.action,                      width: 140 },
        { text: r.entity_type,                 width: 80  },
        { text: `${r.first_name || '?'} ${r.last_name || ''}`, width: 110 },
        { text: r.actor_role || '—',           width: 80  },
      ], y, rowW, false, i % 2 === 1);
    });

    doc.end();
  } catch (err) {
    console.error('[auditReport]', err);
    if (!res.headersSent) res.status(500).json({ error: 'InternalError' });
  }
}

module.exports = { enrollmentReport, financialReport, auditReport };
