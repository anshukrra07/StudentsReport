/**
 * scheduleCron.js
 * Runs on server start. Every 15 minutes it checks for due schedules,
 * generates the report, and emails it as an Excel attachment.
 *
 * Dependencies (add to backend/package.json):
 *   npm install node-cron nodemailer xlsx
 *
 * Required .env variables:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-email@gmail.com
 *   SMTP_PASS=your-app-password      # Gmail App Password (not account password)
 *   SMTP_FROM="VFSTR Reports <your-email@gmail.com>"
 */

const cron      = require('node-cron');
const nodemailer = require('nodemailer');
const XLSX      = require('xlsx');
const mongoose  = require('mongoose');
const Student   = require('./models/Student');
const { buildScopedReportRows } = require('./lib/reportExports');

// ── Lazy-load the Schedule model (defined in reports.js) ──────────────────
function getScheduleModel() {
  try {
    return mongoose.model('Schedule');
  } catch (_) {
    // Define it here if reports.js hasn't been loaded yet
    const schema = new mongoose.Schema({
      reportType:  { type: String, required: true },
      filters:     { type: Object, default: {} },
      frequency:   { type: String, required: true },
      email:       String,
      label:       String,
      createdBy:   String,
      department:  String,
      nextRun:     String,
      lastRunAt:   String,
      lastSentAt:  String,
      lastError:   String,
    }, { timestamps: true });
    return mongoose.model('Schedule', schema);
  }
}

// ── SMTP transporter ──────────────────────────────────────────────────────
function createTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('⚠️  SMTP not configured — scheduled emails will be skipped. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    return null;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT) || 587,
    secure: parseInt(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

// ── Report generators (returns flat array of row objects) ─────────────────
async function generateReportData(reportType, filters = {}) {
  const { department, batch, section } = filters;
  const mongoFilter = {};
  if (department) mongoFilter.department = department;
  if (batch) mongoFilter.batch = batch;
  if (section) mongoFilter.section = section;

  const students = await Student.find(mongoFilter).sort({ rollNumber: 1 });
  return buildScopedReportRows(reportType, students, filters);
}

// ── Build Excel buffer from rows ──────────────────────────────────────────
function buildExcel(rows, sheetName = 'Report') {
  if (!rows.length) return null;
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto column widths
  const colWidths = Object.keys(rows[0]).map(key => ({
    wch: Math.max(key.length, ...rows.slice(0, 50).map(r => String(r[key] ?? '').length)) + 2,
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// ── Calculate next run time ───────────────────────────────────────────────
function getNextRun(frequency) {
  const d = new Date();
  if (frequency === 'daily')   d.setDate(d.getDate() + 1);
  if (frequency === 'weekly')  d.setDate(d.getDate() + 7);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// ── Send one scheduled report ─────────────────────────────────────────────
async function processSchedule(schedule, transporter) {
  const { reportType, filters, frequency, email, label, department } = schedule;
  const Schedule = getScheduleModel();

  if (!email) {
    console.warn(`⚠️  Schedule ${schedule._id} has no email — skipping`);
    await Schedule.findByIdAndUpdate(schedule._id, {
      nextRun: getNextRun(frequency),
      lastRunAt: new Date().toISOString(),
      lastError: 'No recipient email configured for this schedule.',
    });
    return;
  }

  try {
    // Generate data
    const rows = await generateReportData(reportType, { ...filters, department });

    if (!rows.length) {
      console.log(`📭 Schedule "${label}" — no data found, skipping email`);
      await Schedule.findByIdAndUpdate(schedule._id, {
        nextRun: getNextRun(frequency),
        lastRunAt: new Date().toISOString(),
        lastError: 'No rows matched the current schedule filters.',
      });
    } else {
      // Build Excel attachment
      const xlsxBuffer = buildExcel(rows, `${reportType} Report`);
      const dateStr    = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
      const filename   = `${label || reportType}_${dateStr}.xlsx`;

      // Compose email
      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0;font-size:18px">VFSTR Automated Report</h2>
            <p style="color:#93c5fd;margin:6px 0 0;font-size:13px">
              Vignan's Foundation for Science, Technology &amp; Research
            </p>
          </div>
          <div style="background:#f8faff;padding:24px;border:1px solid #e2e8f8;border-top:none;border-radius:0 0 8px 8px">
            <p style="color:#1e2d4a;font-size:14px;margin:0 0 12px">Hello,</p>
            <p style="color:#374151;font-size:14px;margin:0 0 16px">
              Your scheduled <strong>${label || reportType}</strong> report is attached.
            </p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px">
              <tr style="background:#eff6ff">
                <td style="padding:8px 12px;color:#1e2d4a;font-weight:bold;border:1px solid #dbeafe">Report Type</td>
                <td style="padding:8px 12px;color:#374151;border:1px solid #dbeafe">${reportType.charAt(0).toUpperCase() + reportType.slice(1)}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#1e2d4a;font-weight:bold;border:1px solid #dbeafe">Frequency</td>
                <td style="padding:8px 12px;color:#374151;border:1px solid #dbeafe">${frequency.charAt(0).toUpperCase() + frequency.slice(1)}</td>
              </tr>
              <tr style="background:#eff6ff">
                <td style="padding:8px 12px;color:#1e2d4a;font-weight:bold;border:1px solid #dbeafe">Department</td>
                <td style="padding:8px 12px;color:#374151;border:1px solid #dbeafe">${department || 'All'}</td>
              </tr>
              <tr>
                <td style="padding:8px 12px;color:#1e2d4a;font-weight:bold;border:1px solid #dbeafe">Records</td>
                <td style="padding:8px 12px;color:#374151;border:1px solid #dbeafe">${rows.length} rows</td>
              </tr>
              <tr style="background:#eff6ff">
                <td style="padding:8px 12px;color:#1e2d4a;font-weight:bold;border:1px solid #dbeafe">Generated</td>
                <td style="padding:8px 12px;color:#374151;border:1px solid #dbeafe">${new Date().toLocaleString('en-IN')}</td>
              </tr>
            </table>
            <p style="color:#64748b;font-size:12px;margin:0">
              This is an automated report from VFSTR DEO Reports System.<br/>
              Please do not reply to this email.
            </p>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from:        process.env.SMTP_FROM || process.env.SMTP_USER,
        to:          email,
        subject:     `[VFSTR] ${label || reportType} Report — ${new Date().toLocaleDateString('en-IN')}`,
        html,
        attachments: [{ filename, content: xlsxBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
      });

      console.log(`✅ Sent "${label}" report to ${email} (${rows.length} rows)`);
      await Schedule.findByIdAndUpdate(schedule._id, {
        nextRun: getNextRun(frequency),
        lastRunAt: new Date().toISOString(),
        lastSentAt: new Date().toISOString(),
        lastError: '',
      });
      return;
    }
  } catch (err) {
    console.error(`❌ Failed to process schedule "${label}":`, err.message);
    await Schedule.findByIdAndUpdate(schedule._id, {
      nextRun: getNextRun(frequency),
      lastRunAt: new Date().toISOString(),
      lastError: err.message,
    });
  }
}

// ── Main cron job — runs every 15 minutes ────────────────────────────────
function startScheduleCron() {
  const transporter = createTransporter();

  // '*/15 * * * *' = every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      const Schedule = getScheduleModel();
      const now = new Date().toISOString();

      // Find all schedules whose nextRun is due
      const due = await Schedule.find({ nextRun: { $lte: now } });

      if (!due.length) return; // nothing to do

      console.log(`🕐 Cron: found ${due.length} due schedule(s)`);

      if (!transporter) {
        console.warn('⚠️  SMTP not configured — updating nextRun without sending emails');
        for (const s of due) {
          await Schedule.findByIdAndUpdate(s._id, {
            nextRun: getNextRun(s.frequency),
            lastRunAt: new Date().toISOString(),
            lastError: 'SMTP is not configured on the server, so no email was sent.',
          });
        }
        return;
      }

      for (const schedule of due) {
        await processSchedule(schedule, transporter);
      }
    } catch (err) {
      console.error('❌ Cron job error:', err.message);
    }
  });

  console.log('⏰ Report schedule cron started (checks every 15 minutes)');
}

module.exports = { startScheduleCron };
