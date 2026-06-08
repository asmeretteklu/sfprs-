// ============================================================
// Notification Service — Email (Nodemailer / Gmail SMTP)
// TODO for production: Replace Gmail App Password with SendGrid
// or another transactional email provider.
// ============================================================
'use strict';

const nodemailer = require('nodemailer');

// ── Transporter ───────────────────────────────────────────────
// Configure via environment variables — never hardcode credentials.
// Gmail: enable 2FA and use an App Password.
function createTransporter() {
  if (process.env.NODE_ENV === 'test' || !process.env.EMAIL_USER) {
    // Development stub — logs emails to console
    return {
      sendMail: async (opts) => {
        console.log('[email-stub] Would send:', {
          to:      opts.to,
          subject: opts.subject,
          preview: opts.text?.slice(0, 100),
        });
        return { messageId: 'stub-' + Date.now() };
      },
    };
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
}

const FROM_NAME    = 'Microlink IT College Finance';
const FROM_ADDRESS = process.env.EMAIL_USER || 'no-reply@microlink.edu.et';
const FROM         = `"${FROM_NAME}" <${FROM_ADDRESS}>`;

// ── HTML wrapper ──────────────────────────────────────────────
function wrapHTML(title, bodyHTML) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background:#F0EADC; margin:0; padding:20px; }
    .card { background:#fff; border-radius:8px; max-width:540px; margin:0 auto; overflow:hidden; }
    .header { background:#461312; color:#FFD95D; padding:24px 32px; }
    .header h1 { margin:0; font-size:20px; }
    .header p { margin:4px 0 0; font-size:12px; color:#FAE7C9; }
    .body { padding:28px 32px; color:#333; line-height:1.6; }
    .highlight { background:#FAE7C9; border-left:4px solid #ED809D; padding:12px 16px; border-radius:4px; margin:16px 0; }
    .highlight strong { color:#461312; }
    .footer { background:#576238; color:#E8E7E3; font-size:11px; padding:16px 32px; text-align:center; }
    .btn { display:inline-block; background:#576238; color:#fff; padding:10px 24px; border-radius:5px; text-decoration:none; font-size:14px; margin-top:12px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Microlink IT College</h1>
      <p>Mekelle, Tigray · Student Fee & Registration System</p>
    </div>
    <div class="body">${bodyHTML}</div>
    <div class="footer">
      Microlink IT College · Mekelle, Tigray, Ethiopia<br>
      finance@microlink.edu.et · +251 (0) 344 40 00 00
    </div>
  </div>
</body>
</html>`;
}

// ============================================================
// sendRegistrationConfirmation
// ============================================================
async function sendRegistrationConfirmation(to, name, referenceNumber) {
  const transporter = createTransporter();
  const subject     = `Registration Received — ${referenceNumber}`;
  const bodyHTML    = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>Your application to Microlink IT College has been received and is under review.</p>
    <div class="highlight">
      <strong>Reference Number: ${referenceNumber}</strong><br>
      Use this number to track your application status at any time.
    </div>
    <p>You will receive another email once the Registrar has reviewed your application. This typically takes 2–5 business days.</p>
    <p>If you have questions, please visit the Registrar's Office or email <a href="mailto:registrar@microlink.edu.et">registrar@microlink.edu.et</a>.</p>
    <p>Warm regards,<br><strong>Microlink IT College Admissions Team</strong></p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject,
    text:    `Dear ${name}, your registration reference number is ${referenceNumber}. Track at: microlink.edu.et`,
    html:    wrapHTML(subject, bodyHTML),
  });
}

// ============================================================
// sendPaymentNotification
// ============================================================
async function sendPaymentNotification(to, name, receiptNumber, amount, currency = 'ETB') {
  const transporter = createTransporter();
  const subject     = `Payment Received — Receipt ${receiptNumber}`;
  const bodyHTML    = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>Your payment has been successfully recorded. Please find your receipt details below.</p>
    <div class="highlight">
      <strong>Receipt Number: ${receiptNumber}</strong><br>
      <strong>Amount Paid: ${currency} ${parseFloat(amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })}</strong>
    </div>
    <p>You can download your receipt from the student portal or collect a printed copy from the Finance Office.</p>
    <p>Thank you for your payment.</p>
    <p>Regards,<br><strong>Microlink IT College Finance Department</strong></p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject,
    text:    `Receipt ${receiptNumber} issued for ${currency} ${amount}. Thank you.`,
    html:    wrapHTML(subject, bodyHTML),
  });
}

// ============================================================
// sendOverdueWarning
// ============================================================
async function sendOverdueWarning(to, name, feeName, dueDate, amount) {
  const transporter = createTransporter();
  const subject     = 'Action Required — Outstanding Fee Balance';
  const bodyHTML    = `
    <p>Dear <strong>${name}</strong>,</p>
    <p>Our records indicate that the following fee is <strong>overdue</strong>:</p>
    <div class="highlight">
      <strong>Fee:</strong> ${feeName}<br>
      <strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString('en-ET', { dateStyle: 'long' })}<br>
      <strong>Amount:</strong> ETB ${parseFloat(amount).toLocaleString('en-ET', { minimumFractionDigits: 2 })}
    </div>
    <p>Please settle this balance at the Finance Office as soon as possible to avoid enrollment restrictions for the next semester.</p>
    <p>If you have already paid, please disregard this notice and contact the Finance Office with your receipt.</p>
    <p>Regards,<br><strong>Microlink IT College Finance Department</strong></p>
  `;

  await transporter.sendMail({
    from:    FROM,
    to,
    subject,
    text:    `Overdue fee notice: ${feeName} — ETB ${amount}. Please pay at the Finance Office.`,
    html:    wrapHTML(subject, bodyHTML),
  });
}

module.exports = { sendRegistrationConfirmation, sendPaymentNotification, sendOverdueWarning };
