const router = require('express').Router();
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

function buildStudentScope(user, department) {
  if (user.role !== 'admin') return { department: user.department };
  return department ? { department } : {};
}

function buildStudentProfile(student) {
  const semesters = [...(student.semesters || [])].sort((a, b) => a.semNumber - b.semNumber);
  const attendance = [...(student.attendance || [])].sort((a, b) => (
    a.semester - b.semester || String(a.subjectName || '').localeCompare(String(b.subjectName || ''))
  ));

  let cumulativeSum = 0;
  const semesterTrend = semesters.map((sm, index) => {
    cumulativeSum += sm.sgpa || 0;
    const failedSubjects = (sm.subjects || []).filter(sub => sub.status === 'fail');
    const avgAttendance = attendance
      .filter(att => att.semester === sm.semNumber && att.academicYear === sm.academicYear)
      .reduce((acc, att, _, arr) => acc + (att.percentage || 0) / (arr.length || 1), 0);

    return {
      semester: sm.semNumber,
      academicYear: sm.academicYear,
      sgpa: sm.sgpa || 0,
      cumulativeCgpa: parseFloat((cumulativeSum / (index + 1)).toFixed(2)),
      result: sm.result,
      totalCredits: sm.totalCredits || 0,
      earnedCredits: sm.earnedCredits || 0,
      failedSubjects: failedSubjects.map(sub => ({
        subjectCode: sub.subjectCode,
        subjectName: sub.subjectName,
        total: sub.total,
      })),
      avgAttendance: parseFloat(avgAttendance.toFixed(1)) || 0,
    };
  });

  const marksHistory = semesters.flatMap(sm =>
    (sm.subjects || []).map(sub => ({
      semester: sm.semNumber,
      academicYear: sm.academicYear,
      subjectCode: sub.subjectCode,
      subjectName: sub.subjectName,
      internal: sub.internal,
      external: sub.external,
      total: sub.total,
      maxInternal: sub.maxInternal,
      maxExternal: sub.maxExternal,
      status: sub.status,
    }))
  );

  const attendanceHistory = attendance.map(att => ({
    semester: att.semester,
    academicYear: att.academicYear,
    subjectCode: att.subjectCode,
    subjectName: att.subjectName,
    totalClasses: att.totalClasses,
    attendedClasses: att.attendedClasses,
    percentage: att.percentage,
  }));

  const backlogHistory = semesterTrend
    .filter(sm => sm.failedSubjects.length > 0)
    .map(sm => ({
      semester: sm.semester,
      academicYear: sm.academicYear,
      subjects: sm.failedSubjects,
    }));

  const activeBacklogs = student.backlogs || [];
  const avgAttendance = attendanceHistory.length
    ? parseFloat((attendanceHistory.reduce((sum, att) => sum + (att.percentage || 0), 0) / attendanceHistory.length).toFixed(1))
    : 0;

  return {
    student: {
      rollNumber: student.rollNumber,
      name: student.name,
      department: student.department,
      section: student.section,
      batch: student.batch,
      currentSemester: student.currentSemester,
      cgpa: student.cgpa || 0,
      email: student.email || '',
      phone: student.phone || '',
      isActive: student.isActive,
    },
    overview: {
      completedSemesters: semesters.length,
      avgAttendance,
      totalBacklogs: activeBacklogs.length,
      activeBacklogs,
      lowAttendanceSubjects: attendanceHistory.filter(att => (att.percentage || 0) < 75).length,
      passedSemesters: semesterTrend.filter(sm => sm.result === 'pass').length,
    },
    semesterTrend,
    marksHistory,
    attendanceHistory,
    backlogHistory,
  };
}

// Get a single student profile with full academic history
router.get('/profile/:rollNumber', async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const baseScope = buildStudentScope(req.user, req.query.department);
    const student = await Student.findOne({ ...baseScope, rollNumber });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json(buildStudentProfile(student));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all students with filters
router.get('/', async (req, res) => {
  try {
    const { department, batch, section, semester } = req.query;
    const filter = {};

    // Department-level access control
    Object.assign(filter, buildStudentScope(req.user, department));

    if (batch) filter.batch = batch;
    if (section) filter.section = section;
    if (semester) filter.currentSemester = parseInt(semester);

    const students = await Student.find(filter).sort({ rollNumber: 1 });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get distinct values for filters
router.get('/meta', async (req, res) => {
  try {
    const deptFilter = req.user.role !== 'admin' ? req.user.department : null;
    const matchStage = deptFilter ? { department: deptFilter } : {};

    const [departments, batches, sections] = await Promise.all([
      Student.distinct('department', matchStage),
      Student.distinct('batch', matchStage),
      Student.distinct('section', matchStage)
    ]);

    const clean = values => values
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));

    res.json({
      departments: clean(departments),
      batches: clean(batches),
      sections: clean(sections)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
