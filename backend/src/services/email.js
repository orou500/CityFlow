import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!config.smtp.user || !config.smtp.pass) {
    console.warn('[EMAIL] SMTP credentials not configured. Emails will not be sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });

  return transporter;
}

export async function verifyConnection() {
  const transport = getTransporter();
  if (!transport) {
    throw new Error('SMTP not configured');
  }
  await transport.verify();
  console.log('[EMAIL] SMTP connection verified');
}

export async function sendEmail({ to, subject, html, text, from, replyTo, attachments }) {
  const transport = getTransporter();
  if (!transport) {
    console.warn(`[EMAIL] Skipped (no SMTP): ${subject} → ${to}`);
    return { sent: false, reason: 'SMTP not configured' };
  }

  const mailOptions = {
    from: from || config.emailFrom,
    to,
    subject,
    html,
    text: text || stripHtml(html),
    replyTo,
    attachments,
  };

  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const info = await transport.sendMail(mailOptions);
      console.log(`[EMAIL] Sent: ${subject} → ${to} (messageId: ${info.messageId})`);
      return { sent: true, messageId: info.messageId, response: info.response };
    } catch (err) {
      lastError = err;
      console.error(`[EMAIL] Attempt ${attempt}/${maxRetries} failed: ${err.message}`);
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  console.error(`[EMAIL] All ${maxRetries} attempts failed for "${subject}" to ${to}: ${lastError.message}`);
  return { sent: false, error: lastError.message };
}

export async function sendBulkEmail(recipients, { subject, html, text, from }) {
  const results = await Promise.allSettled(recipients.map((to) => sendEmail({ to, subject, html, text, from })));

  const sent = results.filter((r) => r.status === 'fulfilled' && r.value.sent).length;
  const failed = results.length - sent;

  console.log(`[EMAIL] Bulk: ${sent} sent, ${failed} failed out of ${recipients.length}`);
  return { total: recipients.length, sent, failed };
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  verifyConnection,
  sendEmail,
  sendBulkEmail,
};
