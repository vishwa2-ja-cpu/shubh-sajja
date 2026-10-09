const nodemailer = require('nodemailer');

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
const enabled = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
const port = Number(SMTP_PORT || 587);
const transport = enabled
  ? nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  : null;

if (!enabled) console.log('Email is not configured. Alerts will be printed here instead of sent. See README to turn them on.');

const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

// Never throws and never makes the caller wait: a failed email must not break a booking.
function sendMail({ to, subject, text }) {
  if (!to) return;
  subject = oneLine(subject);
  if (!enabled) {
    console.log(`\n[email not sent: not configured]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  transport.sendMail({ from: MAIL_FROM || SMTP_USER, to, subject, text })
    .catch((e) => console.error('Email failed:', e.message));
}

module.exports = { sendMail, emailEnabled: enabled };
