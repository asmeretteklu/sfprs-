// ============================================================
// Finance Service — PDF Receipt Generator
// Format: MLKFEE-YYYY-NNNN
// ============================================================
'use strict';

const PDFDocument = require('pdfkit');
const fs          = require('fs');

// Brand colors
const COLORS = {
  blackBean: '#461312',
  rose:      '#ED809D',
  mustard:   '#FFD95D',
  eggshell:  '#F0EADC',
  moss:      '#576238',
  mint:      '#69A481',
  claret:    '#7C1F31',
  champagne: '#FAE7C9',
};

/**
 * generateReceiptPDF
 * @param {object} opts
 * @param {string} opts.receiptNumber   — MLKFEE-YYYY-NNNN
 * @param {object} opts.student         — { id, name }
 * @param {object} opts.fee             — { name, type, amount, currency }
 * @param {string} opts.paymentMethod
 * @param {string} opts.officerName
 * @param {string} opts.pdfPath         — absolute path to write PDF
 * @returns {Promise<void>}
 */
function generateReceiptPDF(opts) {
  return new Promise((resolve, reject) => {
    const { receiptNumber, student, fee, paymentMethod, officerName, pdfPath } = opts;

    const doc = new PDFDocument({
      size:    'A5',
      margins: { top: 40, bottom: 40, left: 50, right: 50 },
    });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const pageWidth  = doc.page.width;
    const marginLeft = doc.page.margins.left;
    const contentWidth = pageWidth - marginLeft - doc.page.margins.right;

    // ── Header bar ────────────────────────────────────────────
    doc.rect(0, 0, pageWidth, 80).fill(COLORS.blackBean);

    doc.fillColor('white')
       .font('Helvetica-Bold')
       .fontSize(18)
       .text('MICROLINK IT COLLEGE', marginLeft, 18, { width: contentWidth });

    doc.fillColor(COLORS.mustard)
       .font('Helvetica')
       .fontSize(9)
       .text('Mekelle, Tigray · Ethiopia · www.microlink.edu.et', marginLeft, 40, { width: contentWidth });

    doc.fillColor('white')
       .font('Helvetica-Bold')
       .fontSize(9)
       .text('FEE PAYMENT RECEIPT', marginLeft, 56, { width: contentWidth });

    // ── Receipt number badge ──────────────────────────────────
    doc.rect(marginLeft, 90, contentWidth, 30)
       .fill(COLORS.champagne);
    doc.fillColor(COLORS.claret)
       .font('Helvetica-Bold')
       .fontSize(13)
       .text(receiptNumber, marginLeft + 8, 99, { width: contentWidth - 16 });

    // ── Divider ───────────────────────────────────────────────
    doc.moveTo(marginLeft, 132).lineTo(pageWidth - doc.page.margins.right, 132)
       .strokeColor(COLORS.rose).lineWidth(1).stroke();

    // ── Details table ─────────────────────────────────────────
    const rows = [
      ['Student Name',    student.name],
      ['Student ID',      student.id],
      ['Fee Description', fee.name || fee.type],
      ['Amount Paid',     `${fee.currency || 'ETB'} ${parseFloat(fee.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })}`],
      ['Payment Method',  paymentMethod.replace('_', ' ').toUpperCase()],
      ['Date & Time',     new Date().toLocaleString('en-ET', { dateStyle: 'medium', timeStyle: 'short' })],
      ['Issued By',       officerName],
    ];

    let y = 145;
    const colLabel = marginLeft;
    const colValue = marginLeft + 130;
    doc.fontSize(9);

    rows.forEach(([label, value], i) => {
      const bg = i % 2 === 0 ? '#FFFFFF' : COLORS.eggshell;
      doc.rect(marginLeft, y, contentWidth, 22).fill(bg);
      doc.fillColor(COLORS.moss).font('Helvetica-Bold').text(label, colLabel + 4, y + 6, { width: 120 });
      doc.fillColor('#1a1a1a').font('Helvetica').text(String(value), colValue, y + 6, { width: contentWidth - 135 });
      y += 22;
    });

    // ── Total highlighted box ─────────────────────────────────
    y += 8;
    doc.rect(marginLeft, y, contentWidth, 36).fill(COLORS.moss);
    doc.fillColor('white')
       .font('Helvetica-Bold')
       .fontSize(11)
       .text(
         `TOTAL PAID: ${fee.currency || 'ETB'} ${parseFloat(fee.amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })}`,
         marginLeft, y + 11, { width: contentWidth, align: 'center' }
       );

    // ── Footer ────────────────────────────────────────────────
    y += 52;
    doc.moveTo(marginLeft, y).lineTo(pageWidth - doc.page.margins.right, y)
       .strokeColor(COLORS.rose).lineWidth(0.5).stroke();

    doc.fillColor(COLORS.claret)
       .font('Helvetica')
       .fontSize(7)
       .text(
         'This is an official receipt of Microlink IT College. Please retain for your records.\n' +
         'For inquiries: finance@microlink.edu.et',
         marginLeft, y + 8, { width: contentWidth, align: 'center' }
       );

    // ── Stamp area ────────────────────────────────────────────
    doc.circle(pageWidth - 80, y - 10, 30)
       .strokeColor(COLORS.moss)
       .lineWidth(2)
       .stroke();
    doc.fillColor(COLORS.moss)
       .font('Helvetica-Bold')
       .fontSize(6)
       .text('OFFICIAL\nSTAMP', pageWidth - 95, y - 17, { width: 30, align: 'center' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error',  reject);
  });
}

module.exports = { generateReceiptPDF };
