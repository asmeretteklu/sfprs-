// ============================================================
// Notification Service — SMS (Stub)
// TODO: Integrate with Africastalking or Twilio for production
//
// Africastalking example:
//   npm install africastalking
//   const AT = require('africastalking')({ apiKey: '...', username: '...' });
//   await AT.SMS.send({ to: [phone], message, from: 'MICROLINK' });
//
// Twilio example:
//   npm install twilio
//   const client = require('twilio')(accountSid, authToken);
//   await client.messages.create({ body: message, from: '+1...', to: phone });
// ============================================================
'use strict';

async function sendSMS(phone, message) {
  if (!phone || !message) {
    return { status: 'error', message: 'phone and message required' };
  }

  // ── Stub: log to console ──────────────────────────────────
  console.log(`[sms-stub] TO: ${phone} | MSG: ${message}`);

  // TODO: Replace stub with real provider
  // Example with Africastalking:
  // const AT = require('africastalking')({
  //   apiKey:   process.env.AT_API_KEY,
  //   username: process.env.AT_USERNAME,
  // });
  // const result = await AT.SMS.send({
  //   to:      [phone],
  //   message: message,
  //   from:    process.env.AT_SENDER_ID || 'MICROLINK',
  // });
  // return result;

  return { status: 'stub', message: 'SMS logged (provider not configured)' };
}

module.exports = { sendSMS };
