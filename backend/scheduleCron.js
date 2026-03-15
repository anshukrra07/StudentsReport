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
  const { department, batch, section, semester, academicYear } = filters;

  // Build Mongo filter
  const f = {};
  if (department) f.department = department;
  if (batch)      f.batch      = batch;
  if (section)    f.section    = section;
  if (semester)   f.currentSemester = parseInt(semester);

  const students = await Student.find(f).sort({ rollNumber: 1 });

  switch (reportType) {

    case 'attendance': {
      const threshold = parseFloat(filters.threshold) || 75;
      return students.flatMap(s => {
        const atts = s.attendance.filter(a =>
          (!semester    || a.semester    === parseInt(semester)) &&
          (!academicYear|| a.academicYear === academicYear)
        );
        return atts.map(a => ({
          'Roll Number': s.rollNumber,
          'Name':        s.name,
          'Department':  s.department,
          'Section':     s.section,
          'Batch':       s.batch,
          'Subject Code':    a.subjectCode,
          'Subject Name':    a.subjectName,
          'Semester':        a.semester,
          'Academic Year':   a.academicYear,
          'Total Classes':   a.totalClasses,
          'Attended':        a.attendedClasses,
          'Attendance %':    a.percentage,
          'Status':          a.percentage >= threshold ? 'OK' : 'LOW',
        }));
      });
    }

    case 'marks': {
      return students.flatMap(s => {
        const sems = s.semesters.filter(sm =>
          (!semester     || sm.semNumber    === parseInt(semester)) &&
          (!academicYear || sm.academicYear === academicYear)
        );
        return sems.flatMap(sm =>
          sm.subjects.map(sub => ({
            'Roll Number':   s.rollNumber,
            'Name':          s.name,
            'Department':    s.department,
            'Section':       s.section,
            'Batch':         s.batch,
            'Semester':      sm.semNumber,
            'Academic Year': sm.academicYear,
            'SGPA':          sm.sgpa,
            'Subject Code':  sub.subjectCode,
            'Subject Name':  sub.subjectName,
            'Internal':      sub.internal,
            'External':      sub.external,
            'Total':         sub.total,
            'Status':        sub.status,
          }))
        );
      });
    }

    case 'backlogs': {
      return students
        .filter(s => s.backlogs.length > 0)
        .map(s => {
          const fc = {};
          s.semesters.forEach(sm =>
            sm.subjects.filter(sub => sub.status === 'fail').forEach(sub => {
              fc[sub.subjectCode] = (fc[sub.subjectCode] || 0) + 1;
            })
          );
          const repeated = Object.values(fc).filter(c => c > 1).length;
          const totalCredits  = s.semesters.reduce((sum, sm) => sum + (sm.totalCredits  || 0), 0);
          const earnedCredits = s.semesters.reduce((sum, sm) => sum + (sm.earnedCredits || 0), 0);
          return {
            'Roll Number':     s.rollNumber,
            'Name':            s.name,
            'Department':      s.department,
            'Section':         s.section,
            'Batch':           s.batch,
            'CGPA':            s.cgpa,
            'Backlog Count':   s.backlogs.length,
            'Repeated Subjects': repeated,
            'Pending Credits': totalCredits - earnedCredits,
            'Backlog Codes':   s.backlogs.join(', '),
          };
        });
    }

    case 'cgpa': {
      return students
        .sort((a, b) => b.cgpa - a.cgpa)
        .map((s, i) => ({
          'Rank':        i + 1,
          'Roll Number': s.rollNumber,
          'Name':        s.name,
          'Department':  s.department,
          'Section':     s.section,
          'Batch':       s.batch,
          'CGPA':        s.cgpa,
          'Backlogs':    s.backlogs.length,
        }));
    }

    case 'risk': {
      return students
        .map(s => {
          const lowCgpa     = s.cgpa < 6.0;
          const multiBacklog = s.backlogs.length >= 2;
          const lowAtt       = s.attendance.some(a => a.percentage < 65);
          const factors = [
            ...(lowCgpa      ? [`Low CGPA (${s.cgpa})`]            : []),
            ...(multiBacklog ? [`${s.backlogs.length} backlogs`]   : []),
            ...(lowAtt       ? ['Low attendance (<65%)']            : []),
          ];
          return { rollNumber: s.rollNumber, name: s.name, department: s.department,
            section: s.section, batch: s.batch, cgpa: s.cgpa,
            backlogCount: s.backlogs.length, riskScore: factors.length, riskFactors: factors };
        })
        .filter(s => s.riskScore > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .map(s => ({
          'Roll Number':  s.rollNumber,
          'Name':         s.name,
          'Department':   s.department,
          'Section':      s.section,
          'Batch':        s.batch,
          'CGPA':         s.cgpa,
          'Backlogs':     s.backlogCount,
          'Risk Score':   s.riskScore,
          'Risk Factors': s.riskFactors.join('; '),
        }));
    }

    case 'toppers': {
      const limit = parseInt(filters.limit) || 10;
      return students
        .sort((a, b) => b.cgpa - a.cgpa)
        .slice(0, limit)
        .map((s, i) => ({
          'Rank':        i + 1,
          'Roll Number': s.rollNumber,
          'Name':        s.name,
          'Department':  s.department,
          'Batch':       s.batch,
          'Section':     s.section,
          'CGPA':        s.cgpa,
          'Backlogs':    s.backlogs.length,
          'Current Sem': s.currentSemester,
        }));
    }

    default:
      return [];
  }
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

  if (!email) {
    console.warn(`⚠️  Schedule ${schedule._id} has no email — skipping`);
    return;
  }

  try {
    // Generate data
    const rows = await generateReportData(reportType, { ...filters, department });

    if (!rows.length) {
      console.log(`📭 Schedule "${label}" — no data found, skipping email`);
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
    }

    // Update nextRun regardless of whether email was sent
    const Schedule = getScheduleModel();
    await Schedule.findByIdAndUpdate(schedule._id, { nextRun: getNextRun(frequency) });

  } catch (err) {
    console.error(`❌ Failed to process schedule "${label}":`, err.message);
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
          await Schedule.findByIdAndUpdate(s._id, { nextRun: getNextRun(s.frequency) });
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