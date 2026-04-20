const router = require('express').Router();
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');

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
router.get('/attendance', async (req, res) => {
  try {
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
      result = students.map(s => {
        const semAtts = getScopedAttendance(s, req.query);
        if (hasScopedFilter(req.query) && !semAtts.length) return null;
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
          belowThreshold:semAtts.filter(a=>a.percentage<parseFloat(threshold)).length,
          subjectDetails:semAtts.map(a=>({
            code:       a.subjectCode,
            subject:    a.subjectName,
            semester:   a.semester,
            attended:   a.attendedClasses,
            total:      a.totalClasses,
            percentage: a.percentage,
            status:     a.percentage>=parseFloat(threshold)?'OK':'LOW',
          })),
        };
      }).filter(Boolean);
      result.sort((a,b)=>a.avgAttendance-b.avgAttendance);
    }

    res.json({ type, count: result.length, threshold, data: result });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── MARKS ─────────────────────────────────────────────────────────────
router.get('/marks', async (req, res) => {
  try {
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── BACKLOGS (enhanced with repeated subjects + pending credits) ───────
router.get('/backlogs', async (req, res) => {
  try {
    const { subtype } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query));

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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── CGPA ──────────────────────────────────────────────────────────────
router.get('/cgpa', async (req, res) => {
  try {
    const { type } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query));
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── ACADEMIC RISK ─────────────────────────────────────────────────────
router.get('/risk', async (req, res) => {
  try {
    const { riskType } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query));

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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── TOP PERFORMERS ────────────────────────────────────────────────────
router.get('/top-performers', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const students = await Student.find(buildFilter(req.user, req.query));
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─── DASHBOARD SUMMARY ─────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    let students = await Student.find(buildFilter(req.user, req.query));
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
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
}, { timestamps: true });
const Schedule = mongoose.models.Schedule || mongoose.model('Schedule', scheduleSchema);

router.post('/schedule', async (req, res) => {
  try {
    const { reportType, filters, frequency, email, label } = req.body;
    if (!reportType || !frequency) return res.status(400).json({ message: 'reportType and frequency required' });
    const entry = await Schedule.create({
      reportType, filters: filters || {}, frequency, email,
      label: label || `${reportType} report`,
      createdBy: req.user.username,
      department: req.user.department,
      nextRun: getNextRun(frequency),
    });
    res.json({ message: 'Schedule saved', schedule: { ...entry.toObject(), id: entry._id } });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/schedules', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { department: req.user.department };
    const schedules = await Schedule.find(filter).sort({ createdAt: -1 });
    res.json(schedules.map(s => ({ ...s.toObject(), id: s._id })));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/schedule/:id', async (req, res) => {
  try {
    const deleted = await Schedule.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

function getNextRun(freq) {
  const d = new Date();
  if (freq === 'daily')   d.setDate(d.getDate() + 1);
  if (freq === 'weekly')  d.setDate(d.getDate() + 7);
  if (freq === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

// ─── PDF EXPORT ────────────────────────────────────────────────────────
router.get('/export-pdf', async (req, res) => {
  try {
    const { reportType, title } = req.query;
    const students = await Student.find(buildFilter(req.user, req.query)).limit(200);

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

    // Table header
    const headers = getHeaders(reportType);
    const rowH = 20, startX = 40, colW = (doc.page.width - 80) / headers.length;

    doc.rect(startX, doc.y + 6, doc.page.width - 80, rowH).fill('#1565c0');
    headers.forEach((h, i) => {
      doc.fontSize(8).fillColor('#fff').font('Helvetica-Bold')
         .text(h, startX + i * colW + 4, doc.y - rowH + 6, { width: colW - 4 });
    });

    // Rows
    students.slice(0, 80).forEach((s, ri) => {
      const row = getRow(s, reportType, ri + 1);
      const y = doc.y;
      if (y > 540) { doc.addPage(); }
      if (ri % 2 === 0) doc.rect(startX, doc.y + 2, doc.page.width - 80, rowH - 2).fill('#e3f2fd');
      row.forEach((cell, i) => {
        doc.fontSize(7).fillColor('#222').font('Helvetica')
           .text(String(cell ?? ''), startX + i * colW + 3, doc.y - rowH + 8, { width: colW - 4 });
      });
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) { res.status(500).json({ message: err.message }); }
});

function getHeaders(type) {
  const map = {
    attendance: ['Roll No', 'Name', 'Department', 'Section', 'Batch', 'Avg Attendance %'],
    marks:      ['Roll No', 'Name', 'Department', 'Section', 'CGPA', 'Semesters'],
    backlogs:   ['Roll No', 'Name', 'Department', 'Section', 'Batch', 'Backlog Count', 'Repeated'],
    cgpa:       ['Rank', 'Roll No', 'Name', 'Department', 'Batch', 'CGPA'],
    risk:       ['Roll No', 'Name', 'Department', 'CGPA', 'Backlogs', 'Risk Factors'],
    toppers:    ['Rank', 'Roll No', 'Name', 'Department', 'Batch', 'CGPA'],
  };
  return map[type] || ['Roll No', 'Name', 'Department', 'CGPA'];
}
function getRow(s, type, rank) {
  const fc = {}; s.semesters?.forEach(sm => sm.subjects?.filter(sub=>sub.status==='fail').forEach(sub=>{fc[sub.subjectCode]=(fc[sub.subjectCode]||0)+1;}));
  const repeated = Object.values(fc).filter(c=>c>1).length;
  const avgAtt = s.attendance?.length ? (s.attendance.reduce((sum,a)=>sum+a.percentage,0)/s.attendance.length).toFixed(1) : '—';
  const map = {
    attendance: [s.rollNumber, s.name, s.department, s.section, s.batch, avgAtt],
    marks:      [s.rollNumber, s.name, s.department, s.section, s.cgpa, s.semesters?.length],
    backlogs:   [s.rollNumber, s.name, s.department, s.section, s.batch, s.backlogs?.length, repeated],
    cgpa:       [rank, s.rollNumber, s.name, s.department, s.batch, s.cgpa],
    risk:       [s.rollNumber, s.name, s.department, s.cgpa, s.backlogs?.length, '—'],
    toppers:    [rank, s.rollNumber, s.name, s.department, s.batch, s.cgpa],
  };
  return (map[type] || [s.rollNumber, s.name, s.department, s.cgpa]);
}

module.exports = router;
