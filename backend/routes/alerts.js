/**
 * routes/alerts.js
 *
 * POST /api/alerts/dispatch  — send WhatsApp/SMS to a filtered student set
 * GET  /api/alerts/preview   — dry-run: returns who would be alerted (no messages sent)
 * GET  /api/alerts/status    — check if Twilio is configured and working
 */

const router  = require('express').Router();
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');
const { dispatchAlerts, checkTwilioStatus } = require('../lib/alertService');
const { isBatchAcademicYearCompatible, buildImpossibleFilter } = require('../lib/filterCompatibility');

router.use(authenticate);

// ── Helpers ───────────────────────────────────────────────────────────────
function buildFilter(user, query) {
  const { department, batch, section } = query;
  const f = {};
  if (user.role !== 'admin') f.department = user.department;
  else if (department) f.department = department;
  if (batch) f.batch = batch;
  if (section) f.section = section;
  if (!isBatchAcademicYearCompatible(batch, query.academicYear)) {
    return buildImpossibleFilter(f);
  }
  return f;
}

function getScopedAttendance(student, query = {}) {
  const { semester, academicYear } = query;
  return (student.attendance || []).filter(a => {
    const semOk = !semester || a.semester === parseInt(semester, 10);
    const yrOk  = !academicYear || a.academicYear === academicYear;
    return semOk && yrOk;
  });
}

function getAvgAttendance(student, query) {
  const records = getScopedAttendance(student, query);
  if (!records.length) return 100;
  return parseFloat((records.reduce((s, a) => s + a.percentage, 0) / records.length).toFixed(1));
}

// ── Build the student list for a given alert type ─────────────────────────
function buildAlertStudents(students, alertType, query) {
  const threshold = parseFloat(query.threshold) || 75;

  return students
    .map(s => {
      const avgAtt     = getAvgAttendance(s, query);
      const backlogCount = (s.backlogs || []).length;
      const cgpa       = s.cgpa || 0;

      const base = {
        rollNumber: s.rollNumber,
        name: s.name,
        phone: s.phone,
        department: s.department,
        section: s.section,
        batch: s.batch,
        avgAttendance: avgAtt,
        backlogCount,
        cgpa,
      };

      switch (alertType) {
        case 'low_attendance':
          return avgAtt < threshold ? base : null;

        case 'backlog_alert':
          return backlogCount > 0 ? base : null;

        case 'low_cgpa':
          return cgpa > 0 && cgpa < 6.0 ? base : null;

        case 'at_risk':
          // Combined: any of the three risk signals
          return (avgAtt < threshold || backlogCount >= 2 || (cgpa > 0 && cgpa < 6.0)) ? base : null;

        case 'custom':
          return base; // send to everyone in the filtered set

        default:
          return null;
      }
    })
    .filter(Boolean);
}

// ── GET /api/alerts/status ────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  const status = await checkTwilioStatus();
  res.json(status);
});

// ── GET /api/alerts/preview ───────────────────────────────────────────────
// Dry-run — returns who would receive alerts without sending anything.
router.get('/preview', async (req, res) => {
  try {
    const { alertType = 'low_attendance', threshold = 75 } = req.query;

    const mongoFilter = buildFilter(req.user, req.query);
    const students    = await Student.find(mongoFilter);
    const targets     = buildAlertStudents(students, alertType, req.query);

    const withPhone    = targets.filter(s => s.phone);
    const withoutPhone = targets.filter(s => !s.phone);

    res.json({
      alertType,
      threshold: parseFloat(threshold),
      total:      targets.length,
      reachable:  withPhone.length,
      unreachable: withoutPhone.length,
      students: targets.map(s => ({
        rollNumber:    s.rollNumber,
        name:          s.name,
        department:    s.department,
        section:       s.section,
        hasPhone:      !!s.phone,
        avgAttendance: s.avgAttendance,
        backlogCount:  s.backlogCount,
        cgpa:          s.cgpa,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ── POST /api/alerts/dispatch ─────────────────────────────────────────────
router.post('/dispatch', async (req, res) => {
  try {
    const {
      alertType    = 'low_attendance',
      channel      = 'whatsapp',
      threshold    = 75,
      customMessage,
      // optional inline student list (for targeted sends from the UI)
      rollNumbers,
    } = req.body;

    const VALID_TYPES = ['low_attendance', 'backlog_alert', 'low_cgpa', 'at_risk', 'custom'];
    if (!VALID_TYPES.includes(alertType)) {
      return res.status(400).json({ error: 'INVALID_ALERT_TYPE', message: `alertType must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (alertType === 'custom' && !customMessage?.trim()) {
      return res.status(400).json({ error: 'MISSING_MESSAGE', message: 'customMessage is required for custom alert type' });
    }
    if (!['whatsapp', 'sms'].includes(channel)) {
      return res.status(400).json({ error: 'INVALID_CHANNEL', message: 'channel must be whatsapp or sms' });
    }

    let students;

    if (Array.isArray(rollNumbers) && rollNumbers.length > 0) {
      // Targeted send — fetch only named students
      students = await Student.find({ rollNumber: { $in: rollNumbers } });
    } else {
      // Filter-based send
      const mongoFilter = buildFilter(req.user, req.query);
      const allStudents = await Student.find(mongoFilter);
      students = buildAlertStudents(allStudents, alertType, { ...req.query, threshold });
    }

    if (!students.length) {
      return res.json({
        success: true,
        message: 'No students matched the selected criteria.',
        summary: { total: 0, sent: 0, failed: 0, skipped: 0 },
        sent: [], failed: [], skipped: [],
      });
    }

    const actor = {
      username:   req.user.username,
      name:       req.user.name,
      role:       req.user.role,
      department: req.user.department,
    };

    const results = await dispatchAlerts(students, alertType, {
      channel, threshold, customMessage, actor,
    });

    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
