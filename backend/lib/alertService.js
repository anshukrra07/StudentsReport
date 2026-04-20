/**
 * alertService.js
 * Sends WhatsApp and SMS alerts via Twilio for at-risk student interventions.
 *
 * Required .env variables:
 *   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *   TWILIO_AUTH_TOKEN=your_auth_token
 *   TWILIO_PHONE_NUMBER=+1415XXXXXXX        ← your Twilio number (for SMS)
 *   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886  ← Twilio sandbox or approved sender
 *
 * Install: npm install twilio
 */

const { logAudit } = require('./auditLogger');

function getAlertConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    smsNumber: process.env.TWILIO_PHONE_NUMBER || '',
    whatsappNumber: process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_WHATSAPP_FROM || '',
  };
}

// ── Lazy Twilio init (won't crash server if not configured) ───────────────
function getTwilioClient() {
  const { accountSid, authToken } = getAlertConfig();
  if (!accountSid || !authToken) return null;
  // Require inline so missing dep doesn't crash server
  try {
    const twilio = require('twilio');
    return twilio(accountSid, authToken);
  } catch {
    console.warn('⚠️  twilio package not installed. Run: npm install twilio');
    return null;
  }
}

async function checkTwilioStatus() {
  const { accountSid, authToken, smsNumber, whatsappNumber } = getAlertConfig();
  const configured = !!(accountSid && authToken);

  const base = {
    configured,
    authValid: false,
    channels: {
      whatsapp: !!whatsappNumber,
      sms: !!smsNumber,
    },
    accountSidSuffix: accountSid ? accountSid.slice(-6) : '',
  };

  if (!configured) {
    return {
      ...base,
      message: 'Twilio not configured. Add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to .env',
    };
  }

  try {
    const client = getTwilioClient();
    await client.api.v2010.accounts(accountSid).fetch();
    return {
      ...base,
      authValid: true,
      message: 'Twilio is configured and authentication succeeded.',
    };
  } catch (err) {
    return {
      ...base,
      errorCode: err.code || null,
      message: err.code === 20003
        ? 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
        : (err.message || 'Twilio authentication failed.'),
    };
  }
}

// ── Message templates ─────────────────────────────────────────────────────
const TEMPLATES = {
  low_attendance: (student, threshold) =>
    `🎓 *VFSTR Academic Alert*\n\nDear ${student.name} (${student.rollNumber}),\n\nYour current attendance is *below ${threshold}%*. Students with attendance under 75% risk being detained from examinations.\n\n📚 Please attend classes regularly. For queries, contact your HOD.\n\n— VFSTR Academic Office`,

  backlog_alert: (student) =>
    `🎓 *VFSTR Academic Alert*\n\nDear ${student.name} (${student.rollNumber}),\n\nYou currently have *${student.backlogCount} active backlog(s)*. Please clear them at the earliest to avoid further academic penalties.\n\n📚 Contact your faculty advisor for guidance.\n\n— VFSTR Academic Office`,

  low_cgpa: (student) =>
    `🎓 *VFSTR Academic Alert*\n\nDear ${student.name} (${student.rollNumber}),\n\nYour current CGPA is *${student.cgpa}*, which is below the required threshold. Academic counseling is recommended.\n\n📚 Please meet your faculty mentor at the earliest.\n\n— VFSTR Academic Office`,

  custom: (student, message) =>
    `🎓 *VFSTR Academic Notice*\n\nDear ${student.name} (${student.rollNumber}),\n\n${message}\n\n— VFSTR Academic Office`,
};

// ── Normalise Indian phone number to E.164 ────────────────────────────────
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith('091')) return `+${digits.slice(1)}`;
  return null;
}

// ── Send a single message (WhatsApp preferred, SMS fallback) ──────────────
async function sendAlert({ phone, message, channel = 'whatsapp' }) {
  const client = getTwilioClient();
  if (!client) {
    return { success: false, error: 'Twilio not configured — set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env' };
  }

  const to = normalisePhone(phone);
  if (!to) {
    return { success: false, error: `Invalid phone number: "${phone}"` };
  }

  const { smsNumber, whatsappNumber } = getAlertConfig();
  const from = channel === 'whatsapp'
    ? (whatsappNumber || 'whatsapp:+14155238886')
    : smsNumber;

  if (!from) {
    return { success: false, error: `TWILIO_${channel.toUpperCase()}_NUMBER not set in .env` };
  }

  try {
    const result = await client.messages.create({
      from,
      to: channel === 'whatsapp' ? `whatsapp:${to}` : to,
      body: message,
    });
    return { success: true, sid: result.sid, to, channel };
  } catch (err) {
    const error = err.code === 20003
      ? 'Twilio authentication failed. Check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
      : err.message;
    return { success: false, error, to, channel };
  }
}

// ── Bulk alert dispatcher ─────────────────────────────────────────────────
// students: array of { rollNumber, name, phone, ...alertData }
// alertType: 'low_attendance' | 'backlog_alert' | 'low_cgpa' | 'custom'
// options: { channel, threshold, customMessage, actor }
async function dispatchAlerts(students, alertType, options = {}) {
  const { channel = 'whatsapp', threshold = 75, customMessage, actor } = options;

  const results = {
    sent: [], failed: [], skipped: [],
    summary: { total: 0, sent: 0, failed: 0, skipped: 0 },
  };

  for (const student of students) {
    results.summary.total++;

    if (!student.phone) {
      results.skipped.push({ rollNumber: student.rollNumber, name: student.name, reason: 'No phone number on record' });
      results.summary.skipped++;
      continue;
    }

    const templateFn = TEMPLATES[alertType];
    if (!templateFn) {
      results.skipped.push({ rollNumber: student.rollNumber, name: student.name, reason: `Unknown alert type: ${alertType}` });
      results.summary.skipped++;
      continue;
    }

    const message = alertType === 'custom'
      ? TEMPLATES.custom(student, customMessage)
      : alertType === 'low_attendance'
        ? TEMPLATES.low_attendance(student, threshold)
        : templateFn(student);

    const result = await sendAlert({ phone: student.phone, message, channel });

    if (result.success) {
      results.sent.push({ rollNumber: student.rollNumber, name: student.name, to: result.to, sid: result.sid });
      results.summary.sent++;
    } else {
      results.failed.push({ rollNumber: student.rollNumber, name: student.name, error: result.error });
      results.summary.failed++;
    }

    // Small delay to avoid Twilio rate limits
    await new Promise(r => setTimeout(r, 150));
  }

  // Audit log the bulk dispatch
  if (actor) {
    await logAudit({
      actor,
      action: 'alerts.dispatch',
      status: results.summary.sent > 0 ? 'success' : 'failure',
      entityType: 'alert',
      message: `Dispatched ${alertType} alerts: ${results.summary.sent} sent, ${results.summary.failed} failed, ${results.summary.skipped} skipped`,
      metadata: { alertType, channel, threshold, customMessage, ...results.summary },
    }).catch(() => {}); // don't let audit failure block response
  }

  return results;
}

module.exports = { dispatchAlerts, sendAlert, normalisePhone, TEMPLATES, checkTwilioStatus, getAlertConfig };
