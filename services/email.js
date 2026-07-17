const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_PASS) {
    console.warn('[email] SMTP not configured — email sending disabled');
    return null;
  }

  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return _transporter;
}

/**
 * Send an email. Silently no-ops if SMTP is not configured.
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
async function sendEmail({ to, subject, text, html }) {
  const transporter = getTransporter();
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'RoadResQ <no-reply@roadresq.app>',
      to,
      subject,
      text,
      html,
    });
    console.log(`[email] sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`[email] failed to send to ${to}:`, err.message);
    // Do not throw — email failures should never crash the request lifecycle
  }
}

module.exports = { sendEmail };
