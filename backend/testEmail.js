require('dotenv').config();
const nodemailer  = require('nodemailer');
const mongoose    = require('mongoose');
const XLSX        = require('xlsx');
const Student     = require('./models/Student');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';

async function generateReportBuffer() {
  const students = await Student.find({}).sort({ cgpa: -1 }).limit(100);

  const rows = students.map((s, i) => {
    const attPcts  = s.attendance.map(a => a.percentage);
    const avgAtt   = attPcts.length
      ? parseFloat((attPcts.reduce((a, b) => a + b, 0) / attPcts.length).toFixed(1)) : 0;

    return {
      'Rank':            i + 1,
      'Roll Number':     s.rollNumber,
      'Name':            s.name,
      'Department':      s.department,
      'Section':         s.section,
      'Batch':           s.batch,
      'Current Sem':     s.currentSemester,
      'CGPA':            s.cgpa,
      'Avg Attendance %':avgAtt,
      'Backlogs':        s.backlogs.length,
      'Email':           s.email,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto column widths
  ws['!cols'] = Object.keys(rows[0]).map(key => ({
    wch: Math.max(key.length, ...rows.slice(0, 50).map(r => String(r[key] ?? '').length)) + 2,
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Student Report');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function sendTestEmail() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ MongoDB connected');

    // Generate report
    console.log('📊 Generating student report...');
    const xlsxBuffer = await generateReportBuffer();
    const dateStr    = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
    const filename   = `VFSTR_Student_Report_${dateStr}.xlsx`;
    console.log(`✅ Report generated: ${filename}`);

    // Send email
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST,
      port:   parseInt(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const info = await transporter.sendMail({
      from:    process.env.SMTP_FROM,
      to:      'vs4676914@gmail.com',   // ← change this
      subject: `VFSTR Student Report — ${dateStr}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#1e3a8a;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="color:#fff;margin:0">VFSTR Student Report</h2>
            <p style="color:#93c5fd;margin:6px 0 0;font-size:13px">
              Vignan's Foundation for Science, Technology &amp; Research
            </p>
          </div>
          <div style="background:#f8faff;padding:24px;border:1px solid #e2e8f8;border-radius:0 0 8px 8px">
            <p style="color:#1e2d4a;font-size:14px">Hello,</p>
            <p style="color:#374151;font-size:14px">
              Please find the attached student report generated on <strong>${new Date().toLocaleString('en-IN')}</strong>.
            </p>
            <p style="color:#374151;font-size:14px">
              The report contains student rankings, CGPA, attendance, and backlog details.
            </p>
            <p style="color:#64748b;font-size:12px;margin-top:20px">
              This is a test email from VFSTR DEO Reports System.
            </p>
          </div>
        </div>
      `,
      attachments: [{
        filename,
        content:     xlsxBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    });

    console.log('✅ Email sent:', info.messageId);
    console.log(`📎 Attached: ${filename}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected');
  }
}

sendTestEmail();