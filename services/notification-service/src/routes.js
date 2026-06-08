// ============================================================
// Notification Service — Routes
// ============================================================
'use strict';

const express  = require('express');
const router   = express.Router();
const email    = require('./email');
const sms      = require('./sms');

// Registration confirmation
router.post('/registration', async (req, res) => {
  const { referenceNumber, name, email: to } = req.body;
  if (!to || !referenceNumber) return res.status(400).json({ error: 'email and referenceNumber required' });
  try {
    await email.sendRegistrationConfirmation(to, name, referenceNumber);
    res.json({ message: 'Confirmation email queued.' });
  } catch (e) {
    console.error('[notify/registration]', e.message);
    res.status(500).json({ error: 'EmailFailed' });
  }
});

// Payment receipt notification
router.post('/payment', async (req, res) => {
  const { to, name, receiptNumber, amount, currency } = req.body;
  if (!to || !receiptNumber) return res.status(400).json({ error: 'to and receiptNumber required' });
  try {
    await email.sendPaymentNotification(to, name, receiptNumber, amount, currency);
    res.json({ message: 'Payment email queued.' });
  } catch (e) {
    console.error('[notify/payment]', e.message);
    res.status(500).json({ error: 'EmailFailed' });
  }
});

// Overdue warning
router.post('/overdue', async (req, res) => {
  const { to, name, feeName, dueDate, amount } = req.body;
  try {
    await email.sendOverdueWarning(to, name, feeName, dueDate, amount);
    res.json({ message: 'Overdue warning queued.' });
  } catch (e) {
    res.status(500).json({ error: 'EmailFailed' });
  }
});

// SMS (stub)
router.post('/sms', async (req, res) => {
  const { phone, message } = req.body;
  try {
    const result = await sms.sendSMS(phone, message);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: 'SMSFailed' });
  }
});

module.exports = router;
