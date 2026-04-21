const router = require('express').Router();
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');
const { buildScopedReportRows } = require('../lib/reportExports');
const { logAudit } = require('../lib/auditLogger');
const { isBatchAcademicYearCompatible, buildImpossibleFilter } = require('../lib/filterCompatibility');
const { validateReportFilters } = require('../lib/validate');
const { cacheMiddleware } = require('../middleware/cache');

// ─── Centralised async error wrapper ────────────────────────────────────────
// Wraps every route handler so unhandled promise rejections return a structured
// JSON error instead of a silent 500 or hanging request.
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Global error handler (register last in server.js too) ──────────────────
// Placed here so route-level errors in THIS file are caught consistently.
function routeErrorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const isDev  = process.env.NODE_ENV !== 'production';
  res.status(status).json({
    error:   status === 500 ? 'SERVER_ERROR' : 'REQUEST_ERROR',
    message: isDev ? err.message : 'Something went wrong. Please try again.',
    ...(isDev && { stack: err.stack }),
  });
}

router.use(authenticate);

// ─── helpers ──────────────────────────────────────────────────────────
function deptFilter(user, overrideDept) {
  if (user.role === 'admin' && overrideDept) return overrideDept;
  if (user.role !== 'admin') return user.department;
  return null;
}
function buildFilter(user, query, skipSemester = false) {
  const { department, batch, section, semester } = query;
  const f = {};
  const dept = deptFilter(user, department);
  if (dept) f.department = dept;
  if (batch) f.batch = batch;
  if (section) f.section = section;
  if (!isBatchAcademicYearCompatible(batch, query.academicYear)) {
    return buildImpossibleFilter(f);
  }
  // Only filter by currentSemester when explicitly needed (not for attendance/marks which filter internally)
  if (!skipSemester && semester) f.currentSemester = parseInt(semester);
  return f;
}

function matchesSemAndYear(recordSemester, recordAcademicYear, semester, academicYear) {
  const semOk = !semester || recordSemester === parseInt(semester);
  const yrOk = !academicYear || recordAcademicYear === academicYear;
  return semOk && yrOk;
}

function getScopedSemesters(student, query = {}) {
  const { semester, academicYear } = query;
  return (student.semesters || []).filter(sm =>
    matchesSemAndYear(sm.semNumber, sm.academicYear, semester, academicYear)
  );
}

function getScopedAttendance(student, query = {}) {
  const { semester, academicYear } = query;
  return (student.attendance || []).filter(a =>
    matchesSemAndYear(a.semester, a.academicYear, semester, academicYear)
  );
}

function getScopedBacklogCodes(student, query = {}) {
  const semesters = getScopedSemesters(student, query);
  if (!query.semester && !query.academicYear) return student.backlogs || [];
  const failedCodes = [...new Set(semesters.flatMap(sm =>
    (sm.subjects || []).filter(sub => sub.status === 'fail').map(sub => sub.subjectCode)
  ))];
  if (failedCodes.length) return failedCodes;

  // Import fallback: a student imported from the workbook may only have a
  // student-level backlog count, not explicit failed subjects per semester.
  if (semesters.length === 1 && (student.semesters || []).length === 1) {
    return student.backlogs || [];
  }

  return [];
}

function getScopedScore(student, query = {}) {
  const semesters = getScopedSemesters(student, query);
  if (!query.semester && !query.academicYear) return student.cgpa || 0;
  if (!semesters.length) return 0;
  return parseFloat((semesters.reduce((sum, sm) => sum + (sm.sgpa || 0), 0) / semesters.length).toFixed(2));
}

function hasScopedFilter(query = {}) {
  return !!(query.semester || query.academicYear);
}

function getScopedPendingCredits(student, query = {}) {
  const semesters = hasScopedFilter(query) ? getScopedSemesters(student, query) : (student.semesters || []);
  const totalCredits = semesters.reduce((sum, sm) => sum + (sm.totalCredits || 0), 0);
  const earnedCredits = semesters.reduce((sum, sm) => sum + (sm.earnedCredits || 0), 0);
  const explicitPending = totalCredits - earnedCredits;
  if (explicitPending > 0) return explicitPending;

  const backlogCount = getScopedBacklogCodes(student, query).length;
  return backlogCount > 0 ? backlogCount * 4 : 0;
}

// ─── ATTENDANCE ────────────────────────────────────────────────────────
router.get('/attendance', validateReportFilters('attendance'), cacheMiddleware(90), wrap(async (req, res) => {
  {
    const { type, threshold = 75, semester, academicYear } = req.query;
    // Use skipSemester=true — attendance records have their own semester field
    const students = await Student.find(buildFilter(req.user, req.query, true));
    let result = [];

    if (type === 'low_attendance') {
      students.forEach(s => {
        const low = getScopedAttendance(s, req.query)
          .filter(a => a.percentage < parseFloat(threshold));
        if (low.length) result.push({
          rollNumber: s.rollNumber, name: s.name,
          department: s.department, section: s.section, batch: s.batch,
          lowSubjects: low.map(a => ({
            subject: a.subjectName, code: a.subjectCode,
            percentage: a.percentage, attended: a.attendedClasses, total: a.totalClasses
          })),
          lowestPct: Math.min(...low.map(a => a.percentage))
        });
      });
      result.sort((a, b) => a.lowestPct - b.lowestPct);

    } else if (type === 'subject_wise') {
      const map = {};
      students.forEach(s => {
        getScopedAttendance(s, req.query).forEach(a => {
          if (!map[a.subjectCode]) map[a.subjectCode] = { subjectCode: a.subjectCode, subjectName: a.subjectName, semester: a.semester, students: [] };
          map[a.subjectCode].students.push({ rollNumber: s.rollNumber, name: s.name, department: s.department, section: s.section, percentage: a.percentage, attended: a.attendedClasses, total: a.totalClasses });
        });
      });
      result = Object.values(map).map(sub => ({
        ...sub,
        avgPercentage: (sub.students.reduce((s, x) => s + x.percentage, 0) / (sub.students.length || 1)).toFixed(1),
        belowThreshold: sub.students.filter(x => x.percentage < parseFloat(threshold)).length,
        totalStudents: sub.students.length
      }));

    } else if (type === 'department_wise') {
      // Department-wise attendance analysis
      const deptMap = {};
      students.forEach(s => {
        const semAtts = getScopedAttendance(s, req.query);
        if (hasScopedFilter(req.query) && !semAtts.length) return;
        if (!deptMap[s.department]) deptMap[s.department] = { department: s.department, students: [], totalAtt: 0, count: 0 };
        const avg = semAtts.length ? semAtts.reduce((sum, a) => sum + a.percentage, 0) / semAtts.length : 0;
        deptMap[s.department].totalAtt += avg;
        deptMap[s.department].count++;
        deptMap[s.department].students.push({ rollNumber: s.rollNumber, name: s.name, section: s.section, avgAttendance: avg.toFixed(1) });
      });
      result = Object.values(deptMap).map(d => ({
        department: d.department,
        totalStudents: d.count,
        avgAttendance: d.count ? (d.totalAtt / d.count).toFixed(1) : 0,
        belowThreshold: d.students.filter(s => parseFloat(s.avgAttendance) < parseFloat(threshold)).length,
        students: d.students
      }));

    } else {
      // section_wise (default) — return per student with per-subject attendance
      // If threshold is explicitly provided, only include students with at least one subject below it
      const thresholdVal = parseFloat(threshold);
      const thresholdExplicit = !!req.query.threshold; // user set it vs default
      result = students.map(s => {
        const semAtts = getScopedAttendance(s, req.query);
        if (hasScopedFilter(req.query) && !semAtts.length) return null;
        const lowSubjects = semAtts.filter(a => a.percentage < thresholdVal);
        // When threshold is explicitly set: skip students with no subjects below it
        if (thresholdExplicit && lowSubjects.length === 0) return null;
        const avg = semAtts.length
          ? parseFloat((semAtts.reduce((sum,a)=>sum+a.percentage,0)/semAtts.length).toFixed(1))
          : 0;
        return {
          rollNumber:    s.rollNumber,
          name:          s.name,
          department:    s.department,
          section:       s.section,
          batch:         s.batch,
          avgAttendance: avg,
          subjects:      semAtts.length,
          belowThreshold: lowSubjects.length,
          subjectDetails:semAtts.map(a=>({
            code:       a.subjectCode,
            subject:    a.subjectName,
            semester:   a.semester,
            attended:   a.attendedClasses,
            total:      a.totalClasses,
            percentage: a.percentage,
            status:     a.percentage>=thresholdVal?'OK':'LOW',
          })),
        };
      }).filter(Boolean);
      result.sort((a,b)=>a.avgAttendance-b.avgAttendance);
    }

    res.json({ type, count: result.length, threshold, data: result });
  }
}));

// ─── MARKS ─────────────────────────────────────────────────────────────
router.get('/marks', validateReportFilters('marks'), cacheMiddleware(90), wrap(async (req, res) => {
  {
    const { type } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query, true));
    let result = [];

    if (type === 'semester_summary') {
      // Semester result summaries — pass/fail stats per semester
      const semMap = {};
      students.forEach(s => {
        getScopedSemesters(s, req.query).forEach(sm => {
          const key = sm.semNumber;
          if (!semMap[key]) semMap[key] = { semester: key, academicYear: sm.academicYear, pass: 0, fail: 0, detained: 0, totalStudents: 0, avgSgpa: 0, sgpaSum: 0 };
          semMap[key].totalStudents++;
          semMap[key].sgpaSum += sm.sgpa || 0;
          if (sm.result === 'pass') semMap[key].pass++;
          else if (sm.result === 'fail') semMap[key].fail++;
          else semMap[key].detained++;
        });
      });
      result = Object.values(semMap).map(s => ({ ...s, avgSgpa: s.totalStudents ? (s.sgpaSum / s.totalStudents).toFixed(2) : 0, passPercent: s.totalStudents ? ((s.pass / s.totalStudents) * 100).toFixed(1) : 0 }));

    } else if (type === 'subject_performance') {
      const map = {};
      students.forEach(s => {
        const sems = getScopedSemesters(s, req.query);
        sems.forEach(sm => {
          sm.subjects.forEach(sub => {
            if (!map[sub.subjectCode]) map[sub.subjectCode] = { subjectCode: sub.subjectCode, subjectName: sub.subjectName, semester: sm.semNumber, students: [] };
            map[sub.subjectCode].students.push({ rollNumber: s.rollNumber, name: s.name, internal: sub.internal, external: sub.external, total: sub.total, status: sub.status });
          });
        });
      });
      result = Object.values(map).map(sub => ({
        ...sub,
        avgTotal: (sub.students.reduce((s, x) => s + (x.total || 0), 0) / (sub.students.length || 1)).toFixed(1),
        passCount: sub.students.filter(x => x.status === 'pass').length,
        failCount: sub.students.filter(x => x.status === 'fail').length,
        passRate: sub.students.length ? ((sub.students.filter(x => x.status === 'pass').length / sub.students.length) * 100).toFixed(1) : 0
      }));

    } else {
      // internal / external
      result = students.map(s => {
        const yrSems = getScopedSemesters(s, req.query);
        if (hasScopedFilter(req.query) && !yrSems.length) return null;
        return {
          rollNumber: s.rollNumber, name: s.name, department: s.department,
          section: s.section, batch: s.batch, cgpa: s.cgpa,
          semesters: yrSems.map(sm => ({
            semNumber: sm.semNumber, academicYear: sm.academicYear, sgpa: sm.sgpa, result: sm.result,
            subjects: type === 'internal'
              ? sm.subjects.map(sub => ({ code: sub.subjectCode, name: sub.subjectName, marks: sub.internal, max: sub.maxInternal, status: sub.status }))
              : sm.subjects.map(sub => ({ code: sub.subjectCode, name: sub.subjectName, marks: sub.external, max: sub.maxExternal, total: sub.total, status: sub.status }))
            }))
        };
      }).filter(Boolean);
    }
    res.json({ type, count: result.length, data: result });
  }
}));

// ─── BACKLOGS ──────────────────────────────────────────────────────────
router.get('/backlogs', validateReportFilters('backlogs'), cacheMiddleware(90), wrap(async (req, res) => {
  {
    const { subtype } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query, true));

    let result = students.map(s => {
      const scopedSemesters = getScopedSemesters(s, req.query);
      const semesters = (req.query.semester || req.query.academicYear) ? scopedSemesters : s.semesters;
      const scopedBacklogs = getScopedBacklogCodes(s, req.query);
      // Find repeated subjects (failed more than once)
      const subjectFailCount = {};
      semesters.forEach(sm => {
        sm.subjects.filter(sub => sub.status === 'fail').forEach(sub => {
          subjectFailCount[sub.subjectCode] = (subjectFailCount[sub.subjectCode] || 0) + 1;
        });
      });
      const repeatedSubjects = Object.entries(subjectFailCount)
        .filter(([, c]) => c > 1)
        .map(([code, count]) => ({ code, failCount: count }));

      // Pending course completions
      const totalCredits  = semesters.reduce((sum, sm) => sum + (sm.totalCredits || 0), 0);
      const earnedCredits = semesters.reduce((sum, sm) => sum + (sm.earnedCredits || 0), 0);
      const pendingCredits = getScopedPendingCredits(s, req.query);

      return {
        rollNumber: s.rollNumber, name: s.name,
        department: s.department, section: s.section, batch: s.batch,
        cgpa: s.cgpa,
        backlogCount: scopedBacklogs.length,
        backlogs: scopedBacklogs,
        repeatedSubjects,
        repeatedCount: repeatedSubjects.length,
        pendingCredits,
        totalCredits,
        earnedCredits,
        failedSubjects: semesters.flatMap(sm =>
          sm.subjects.filter(sub => sub.status === 'fail').map(sub => ({
            sem: sm.semNumber, code: sub.subjectCode, name: sub.subjectName, total: sub.total
          }))
        )
      };
    }).filter(s => s.backlogCount > 0 || s.pendingCredits > 0);

    // Filter by subtype
    if (subtype === 'repeated') result = result.filter(s => s.repeatedCount > 0);
    if (subtype === 'pending')  result = result.filter(s => s.pendingCredits > 0);

    result.sort((a, b) => b.backlogCount - a.backlogCount);
    res.json({ count: result.length, data: result });
  }
}));

// ─── CGPA ──────────────────────────────────────────────────────────────
router.get('/cgpa', validateReportFilters('cgpa'), cacheMiddleware(120), wrap(async (req, res) => {
  {
    const { type } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query, true));
    const rankedStudents = students
      .map(s => ({ student: s, score: getScopedScore(s, req.query) }))
      .filter(({ score }) => !req.query.semester && !req.query.academicYear ? true : score > 0)
      .sort((a, b) => b.score - a.score);

    if (type === 'distribution') {
      const ranges = [
        { label: '9.0–10.0', min: 9.0, max: 10.0, count: 0, color: '#00e676' },
        { label: '8.0–8.9',  min: 8.0, max: 8.99, count: 0, color: '#40c4ff' },
        { label: '7.0–7.9',  min: 7.0, max: 7.99, count: 0, color: '#ffab40' },
        { label: '6.0–6.9',  min: 6.0, max: 6.99, count: 0, color: '#ea80fc' },
        { label: '5.0–5.9',  min: 5.0, max: 5.99, count: 0, color: '#ff6e40' },
        { label: 'Below 5',  min: 0,   max: 4.99, count: 0, color: '#ff5252' },
      ];
      rankedStudents.forEach(({ score }) => {
        const r = ranges.find(r => score >= r.min && score <= r.max);
        if (r) r.count++;
      });
      return res.json({ type, totalStudents: rankedStudents.length, distribution: ranges });
    }

    if (type === 'toppers') {
      const limit = parseInt(req.query.limit) || 10;
      return res.json({ type, data: rankedStudents.slice(0, limit).map(({ student, score }, i) => ({
        rank: i + 1, rollNumber: student.rollNumber, name: student.name,
        department: student.department, batch: student.batch, section: student.section, cgpa: score,
        backlogs: getScopedBacklogCodes(student, req.query).length
      }))});
    }

    // full ranking
    res.json({ count: rankedStudents.length, data: rankedStudents.map(({ student, score }, i) => ({
      rank: i + 1, rollNumber: student.rollNumber, name: student.name,
      department: student.department, section: student.section, batch: student.batch, cgpa: score
    }))});
  }
}));

// ─── ACADEMIC RISK ─────────────────────────────────────────────────────
router.get('/risk', validateReportFilters('risk'), cacheMiddleware(90), wrap(async (req, res) => {
  {
    const { riskType } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query, true));

    let atRisk = students.map(s => {
      const scopedSemesters = getScopedSemesters(s, req.query);
      const scopedAttendance = getScopedAttendance(s, req.query);
      if (hasScopedFilter(req.query) && !scopedSemesters.length && !scopedAttendance.length) return null;
      const scopedScore = getScopedScore(s, req.query);
      const scopedBacklogs = getScopedBacklogCodes(s, req.query);
      const lowCgpa      = scopedScore < 6.0;
      const multiBacklog = scopedBacklogs.length >= 2;
      const lowAtt       = scopedAttendance.some(a => a.percentage < 65);
      const riskFactors  = [
        ...(lowCgpa       ? [`Low CGPA (${scopedScore})`] : []),
        ...(multiBacklog  ? [`${scopedBacklogs.length} backlogs`] : []),
        ...(lowAtt        ? ['Low attendance (<65%)'] : []),
      ];
      return { rollNumber: s.rollNumber, name: s.name, department: s.department, section: s.section, batch: s.batch, cgpa: scopedScore, backlogCount: scopedBacklogs.length, riskFactors, riskScore: riskFactors.length, lowCgpa, multiBacklog, lowAtt };
    }).filter(s => s && s.riskScore > 0);

    // Filter by specific risk type
    if (riskType === 'low_cgpa')      atRisk = atRisk.filter(s => s.lowCgpa);
    if (riskType === 'backlogs')      atRisk = atRisk.filter(s => s.multiBacklog);
    if (riskType === 'low_attendance')atRisk = atRisk.filter(s => s.lowAtt);

    atRisk.sort((a, b) => b.riskScore - a.riskScore);
    res.json({ count: atRisk.length, data: atRisk });
  }
}));

// ─── TOP PERFORMERS ────────────────────────────────────────────────────
router.get('/top-performers', validateReportFilters('toppers'), cacheMiddleware(120), wrap(async (req, res) => {
  {
    const limit = parseInt(req.query.limit) || 10;
    const students = await Student.find(buildFilter(req.user, req.query, true));
    const rankedStudents = students
      .map(s => ({ student: s, score: getScopedScore(s, req.query) }))
      .filter(({ score }) => !req.query.semester && !req.query.academicYear ? true : score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    res.json({ count: rankedStudents.length, data: rankedStudents.map(({ student, score }, i) => ({
      rank: i + 1, rollNumber: student.rollNumber, name: student.name,
      department: student.department, batch: student.batch, section: student.section,
      cgpa: score, backlogs: getScopedBacklogCodes(student, req.query).length, currentSemester: student.currentSemester
    }))});
  }
}));

// ─── DASHBOARD SUMMARY ─────────────────────────────────────────────────
router.get('/summary', cacheMiddleware(60), wrap(async (req, res) => {
  {
    let students = await Student.find(buildFilter(req.user, req.query, true));
    if (hasScopedFilter(req.query)) {
      students = students.filter(s => getScopedSemesters(s, req.query).length || getScopedAttendance(s, req.query).length);
    }
    const total        = students.length;
    const scopedScores = students.map(s => getScopedScore(s, req.query));
    const avgCGPA      = total ? parseFloat((scopedScores.reduce((sum, score) => sum + score, 0) / total).toFixed(2)) : 0;
    const withBacklogs = students.filter(s => getScopedBacklogCodes(s, req.query).length > 0).length;
    const lowAttendance= students.filter(s => getScopedAttendance(s, req.query).some(a => a.percentage < 75)).length;
    const atRisk       = students.filter(s => {
      const score = getScopedScore(s, req.query);
      const backlogs = getScopedBacklogCodes(s, req.query);
      const attendance = getScopedAttendance(s, req.query);
      return score < 6.0 || backlogs.length >= 2 || attendance.some(a => a.percentage < 65);
    }).length;
    const toppers      = students.filter(s => getScopedScore(s, req.query) >= 9.0).length;
    const repeatedSubj = students.filter(s => {
      const fc = {}; let has = false;
      getScopedSemesters(s, req.query).forEach(sm => sm.subjects.filter(sub=>sub.status==='fail').forEach(sub=>{fc[sub.subjectCode]=(fc[sub.subjectCode]||0)+1;if(fc[sub.subjectCode]>1)has=true;}));
      return has;
    }).length;
    res.json({ total, avgCGPA, withBacklogs, lowAttendance, atRisk, toppers, repeatedSubj });
  }
}));

// ─── SCHEDULE REPORT (MongoDB-backed persistence) ──────────────────────────
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
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
const Schedule = mongoose.models.Schedule || mongoose.model('Schedule', scheduleSchema);

router.post('/schedule', wrap(async (req, res) => {
  {
    const { reportType, filters, frequency, email, label } = req.body;
    if (!reportType || !frequency) return res.status(400).json({ message: 'reportType and frequency required' });
    const entry = await Schedule.create({
      reportType, filters: filters || {}, frequency, email,
      label: label || `${reportType} report`,
      createdBy: req.user.username,
      department: req.user.department,
      nextRun: getNextRun(frequency),
    });
    await logAudit({
      req,
      user: req.user,
      action: 'schedule.create',
      entityType: 'schedule',
      entityId: entry._id,
      message: `Created schedule "${label || `${reportType} report`}".`,
      metadata: { reportType, frequency, email, filters: filters || {} },
    });
    res.json({ message: 'Schedule saved', schedule: { ...entry.toObject(), id: entry._id } });
  }
}));

router.get('/schedules', wrap(async (req, res) => {
  {
    const filter = req.user.role === 'admin' ? {} : { department: req.user.department };
    const schedules = await Schedule.find(filter).sort({ createdAt: -1 });
    res.json(schedules.map(s => ({ ...s.toObject(), id: s._id })));
  }
}));

router.delete('/schedule/:id', wrap(async (req, res) => {
  {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ message: 'Not found' });
    const isOwner = schedule.createdBy === req.user.username;
    const isSameDepartment = schedule.department === req.user.department;
    const canDelete = req.user.role === 'admin' || isOwner || isSameDepartment;

    if (!canDelete) {
      await logAudit({
        req,
        user: req.user,
        action: 'schedule.delete',
        status: 'failure',
        entityType: 'schedule',
        entityId: req.params.id,
        message: 'Schedule delete denied due to insufficient permissions.',
        metadata: { scheduleDepartment: schedule.department, scheduleCreatedBy: schedule.createdBy },
      });
      return res.status(403).json({ message: 'Not allowed to delete this schedule' });
    }

    await Schedule.findByIdAndDelete(req.params.id);
    await logAudit({
      req,
      user: req.user,
      action: 'schedule.delete',
      entityType: 'schedule',
      entityId: req.params.id,
      message: `Deleted schedule "${schedule.label || schedule.reportType}".`,
      metadata: { reportType: schedule.reportType, frequency: schedule.frequency, email: schedule.email },
    });
    res.json({ message: 'Deleted' });
  }
}));

function getNextRun(freq) {
  const d = new Date();
  if (freq === 'daily')   d.setDate(d.getDate() + 1);
  if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// ─── PDF EXPORT ────────────────────────────────────────────────────────
router.get('/export-pdf', wrap(async (req, res) => {
  {
    const { reportType, title } = req.query;
    let students = await Student.find(buildFilter(req.user, req.query, true)).limit(200);
    if (hasScopedFilter(req.query)) {
      students = students.filter(s => getScopedSemesters(s, req.query).length || getScopedAttendance(s, req.query).length);
    }
    const rows = buildScopedReportRows(reportType, students, req.query).slice(0, 200);
    await logAudit({
      req,
      user: req.user,
      action: 'report.export_pdf',
      entityType: 'report',
      entityId: reportType || '',
      message: `Exported ${reportType || 'unknown'} report as PDF.`,
      metadata: { reportType, title: title || '', rowCount: rows.length, filters: { ...req.query } },
    });

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType || 'report'}_${Date.now()}.pdf"`);
    doc.pipe(res);

    // Header
    doc.rect(0, 0, doc.page.width, 60).fill('#0d47a1');
    doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
       .text("VIGNAN'S FOUNDATION FOR SCIENCE, TECHNOLOGY & RESEARCH", 40, 15, { align: 'center' });
    doc.fontSize(11).fillColor('#bbdefb')
       .text(title || `${reportType?.toUpperCase()} REPORT`, 40, 38, { align: 'center' });

    doc.moveDown(2.5);
    doc.fontSize(9).fillColor('#333')
       .text(`Generated: ${new Date().toLocaleString('en-IN')}   |   Dept: ${req.user.department}   |   By: ${req.user.name}`, { align: 'right' });

    if (!rows.length) {
      doc.moveDown(3);
      doc.fontSize(14).fillColor('#64748b').font('Helvetica-Bold')
        .text('No records found for the selected filters.', { align: 'center' });
      doc.end();
      return;
    }

    const headers = Object.keys(rows[0]);
    const tableRows = rows.map(row => headers.map(header => row[header]));
    const rowH = 20;
    const startX = 40;
    const maxRowsPerPage = 22;
    const colW = (doc.page.width - 80) / headers.length;

    const renderHeader = () => {
      doc.rect(startX, doc.y + 6, doc.page.width - 80, rowH).fill('#1565c0');
      headers.forEach((header, index) => {
        doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
          .text(String(header), startX + index * colW + 4, doc.y - rowH + 6, { width: colW - 6 });
      });
      doc.moveDown(0.8);
    };

    renderHeader();

    tableRows.forEach((row, rowIndex) => {
      if (rowIndex > 0 && rowIndex % maxRowsPerPage === 0) {
        doc.addPage();
        renderHeader();
      }

      const y = doc.y;
      if (rowIndex % 2 === 0) {
        doc.rect(startX, y + 2, doc.page.width - 80, rowH - 2).fill('#e3f2fd');
      }

      row.forEach((cell, index) => {
        doc.fontSize(7).fillColor('#222').font('Helvetica')
          .text(String(cell ?? ''), startX + index * colW + 3, y + 6, { width: colW - 6, ellipsis: true });
      });
      doc.y = y + rowH;
    });

    doc.end();
  }
}));

// ─── Route-level error handler ────────────────────────────────────────────
router.use(routeErrorHandler);

module.exports = router;