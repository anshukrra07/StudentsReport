const { isBatchAcademicYearCompatible } = require('./filterCompatibility');

function matchesSemAndYear(recordSemester, recordAcademicYear, semester, academicYear) {
  const semOk = !semester || recordSemester === parseInt(semester, 10);
  const yrOk = !academicYear || recordAcademicYear === academicYear;
  return semOk && yrOk;
}

function hasScopedFilter(query = {}) {
  return !!(query.semester || query.academicYear);
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
  if (!hasScopedFilter(query)) return student.backlogs || [];

  const failedCodes = [...new Set(getScopedSemesters(student, query).flatMap(sm =>
    (sm.subjects || []).filter(sub => sub.status === 'fail').map(sub => sub.subjectCode)
  ))];

  if (failedCodes.length) return failedCodes;

  if (getScopedSemesters(student, query).length === 1 && (student.semesters || []).length === 1) {
    return student.backlogs || [];
  }

  return [];
}

function getScopedScore(student, query = {}) {
  if (!hasScopedFilter(query)) return student.cgpa || 0;
  const semesters = getScopedSemesters(student, query);
  if (!semesters.length) return 0;
  return parseFloat((semesters.reduce((sum, sm) => sum + (sm.sgpa || 0), 0) / semesters.length).toFixed(2));
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

function buildAttendanceRows(students, query = {}) {
  const type = query.type || 'section_wise';
  const threshold = parseFloat(query.threshold) || 75;

  if (type === 'low_attendance') {
    return students.map(student => {
      const lowSubjects = getScopedAttendance(student, query).filter(a => a.percentage < threshold);
      if (!lowSubjects.length) return null;
      return {
        'Roll Number': student.rollNumber,
        'Name': student.name,
        'Department': student.department,
        'Section': student.section,
        'Batch': student.batch,
        'Lowest Attendance %': Math.min(...lowSubjects.map(a => a.percentage)),
        'Low Subjects': lowSubjects.map(a => `${a.subjectCode} (${a.percentage}%)`).join(', '),
      };
    }).filter(Boolean);
  }

  if (type === 'subject_wise') {
    const map = {};
    students.forEach(student => {
      getScopedAttendance(student, query).forEach(a => {
        if (!map[a.subjectCode]) {
          map[a.subjectCode] = {
            'Subject Code': a.subjectCode,
            'Subject Name': a.subjectName,
            'Semester': a.semester,
            totalPercentage: 0,
            totalStudents: 0,
            belowThreshold: 0,
          };
        }
        map[a.subjectCode].totalStudents += 1;
        map[a.subjectCode].totalPercentage += a.percentage;
        if (a.percentage < threshold) map[a.subjectCode].belowThreshold += 1;
      });
    });
    return Object.values(map).map(row => ({
      'Subject Code': row['Subject Code'],
      'Subject Name': row['Subject Name'],
      'Semester': row['Semester'],
      'Total Students': row.totalStudents,
      'Average Attendance %': parseFloat((row.totalPercentage / row.totalStudents).toFixed(1)),
      'Below Threshold': row.belowThreshold,
    }));
  }

  if (type === 'department_wise') {
    const map = {};
    students.forEach(student => {
      const atts = getScopedAttendance(student, query);
      if (hasScopedFilter(query) && !atts.length) return;
      if (!map[student.department]) {
        map[student.department] = {
          'Department': student.department,
          totalStudents: 0,
          totalAvg: 0,
          belowThreshold: 0,
        };
      }
      const avg = atts.length ? atts.reduce((sum, a) => sum + a.percentage, 0) / atts.length : 0;
      map[student.department].totalStudents += 1;
      map[student.department].totalAvg += avg;
      if (avg < threshold) map[student.department].belowThreshold += 1;
    });
    return Object.values(map).map(row => ({
      'Department': row['Department'],
      'Total Students': row.totalStudents,
      'Average Attendance %': parseFloat((row.totalAvg / row.totalStudents).toFixed(1)),
      'Below Threshold': row.belowThreshold,
    }));
  }

  return students.map(student => {
    const atts = getScopedAttendance(student, query);
    if (hasScopedFilter(query) && !atts.length) return null;
    const avgAttendance = atts.length
      ? parseFloat((atts.reduce((sum, a) => sum + a.percentage, 0) / atts.length).toFixed(1))
      : 0;
    return {
      'Roll Number': student.rollNumber,
      'Name': student.name,
      'Department': student.department,
      'Section': student.section,
      'Batch': student.batch,
      'Average Attendance %': avgAttendance,
      'Subjects Tracked': atts.length,
      'Low Subjects': atts.filter(a => a.percentage < threshold).length,
    };
  }).filter(Boolean);
}

function buildMarksRows(students, query = {}) {
  const type = query.type || 'external';

  if (type === 'semester_summary') {
    const map = {};
    students.forEach(student => {
      getScopedSemesters(student, query).forEach(sm => {
        const key = `${sm.semNumber}:${sm.academicYear}`;
        if (!map[key]) {
          map[key] = {
            'Semester': sm.semNumber,
            'Academic Year': sm.academicYear,
            pass: 0,
            fail: 0,
            detained: 0,
            totalStudents: 0,
            sgpaSum: 0,
          };
        }
        map[key].totalStudents += 1;
        map[key].sgpaSum += sm.sgpa || 0;
        if (sm.result === 'pass') map[key].pass += 1;
        else if (sm.result === 'fail') map[key].fail += 1;
        else map[key].detained += 1;
      });
    });
    return Object.values(map).map(row => ({
      'Semester': row['Semester'],
      'Academic Year': row['Academic Year'],
      'Total Students': row.totalStudents,
      'Pass': row.pass,
      'Fail': row.fail,
      'Detained': row.detained,
      'Average SGPA': parseFloat((row.sgpaSum / row.totalStudents).toFixed(2)),
      'Pass %': parseFloat(((row.pass / row.totalStudents) * 100).toFixed(1)),
    }));
  }

  if (type === 'subject_performance') {
    const map = {};
    students.forEach(student => {
      getScopedSemesters(student, query).forEach(sm => {
        (sm.subjects || []).forEach(sub => {
          const key = sub.subjectCode;
          if (!map[key]) {
            map[key] = {
              'Subject Code': sub.subjectCode,
              'Subject Name': sub.subjectName,
              'Semester': sm.semNumber,
              totalMarks: 0,
              totalStudents: 0,
              passCount: 0,
              failCount: 0,
            };
          }
          map[key].totalStudents += 1;
          map[key].totalMarks += sub.total || 0;
          if (sub.status === 'pass') map[key].passCount += 1;
          if (sub.status === 'fail') map[key].failCount += 1;
        });
      });
    });
    return Object.values(map).map(row => ({
      'Subject Code': row['Subject Code'],
      'Subject Name': row['Subject Name'],
      'Semester': row['Semester'],
      'Average Total': parseFloat((row.totalMarks / row.totalStudents).toFixed(1)),
      'Pass Count': row.passCount,
      'Fail Count': row.failCount,
      'Pass %': parseFloat(((row.passCount / row.totalStudents) * 100).toFixed(1)),
    }));
  }

  return students.flatMap(student =>
    getScopedSemesters(student, query).flatMap(sm =>
      (sm.subjects || []).map(sub => ({
        'Roll Number': student.rollNumber,
        'Name': student.name,
        'Department': student.department,
        'Section': student.section,
        'Batch': student.batch,
        'Semester': sm.semNumber,
        'Academic Year': sm.academicYear,
        'SGPA': sm.sgpa,
        'Subject Code': sub.subjectCode,
        'Subject Name': sub.subjectName,
        ...(type === 'internal'
          ? { 'Internal Marks': sub.internal, 'Max Marks': sub.maxInternal }
          : { 'External Marks': sub.external, 'Max Marks': sub.maxExternal, 'Total Marks': sub.total }),
        'Status': sub.status,
      }))
    )
  );
}

function buildBacklogRows(students, query = {}) {
  const subtype = query.subtype || query.type || '';
  let rows = students.map(student => {
    const semesters = hasScopedFilter(query) ? getScopedSemesters(student, query) : (student.semesters || []);
    const backlogs = getScopedBacklogCodes(student, query);
    const failCounts = {};
    semesters.forEach(sm => {
      (sm.subjects || []).filter(sub => sub.status === 'fail').forEach(sub => {
        failCounts[sub.subjectCode] = (failCounts[sub.subjectCode] || 0) + 1;
      });
    });
    const repeatedSubjects = Object.entries(failCounts)
      .filter(([, count]) => count > 1)
      .map(([code, count]) => `${code} (${count})`);
    const pendingCredits = getScopedPendingCredits(student, query);

    return {
      'Roll Number': student.rollNumber,
      'Name': student.name,
      'Department': student.department,
      'Section': student.section,
      'Batch': student.batch,
      'CGPA': student.cgpa,
      'Backlog Count': backlogs.length,
      'Backlog Codes': backlogs.join(', '),
      'Repeated Subjects': repeatedSubjects.join(', '),
      'Repeated Count': repeatedSubjects.length,
      'Pending Credits': pendingCredits,
    };
  }).filter(row => row['Backlog Count'] > 0 || row['Pending Credits'] > 0);

  if (subtype === 'repeated') rows = rows.filter(row => row['Repeated Count'] > 0);
  if (subtype === 'pending') rows = rows.filter(row => row['Pending Credits'] > 0);
  return rows;
}

function buildCgpaRows(students, query = {}) {
  const type = query.type || 'ranking';
  const ranked = students
    .map(student => ({ student, score: getScopedScore(student, query) }))
    .filter(({ score }) => !hasScopedFilter(query) || score > 0)
    .sort((a, b) => b.score - a.score);

  if (type === 'distribution') {
    const ranges = [
      { label: '9.0–10.0', min: 9.0, max: 10.0, count: 0 },
      { label: '8.0–8.9', min: 8.0, max: 8.99, count: 0 },
      { label: '7.0–7.9', min: 7.0, max: 7.99, count: 0 },
      { label: '6.0–6.9', min: 6.0, max: 6.99, count: 0 },
      { label: '5.0–5.9', min: 5.0, max: 5.99, count: 0 },
      { label: 'Below 5', min: 0, max: 4.99, count: 0 },
    ];
    ranked.forEach(({ score }) => {
      const range = ranges.find(item => score >= item.min && score <= item.max);
      if (range) range.count += 1;
    });
    return ranges.map(range => ({
      'CGPA Range': range.label,
      'Student Count': range.count,
    }));
  }

  const rows = ranked.map(({ student, score }, index) => ({
    'Rank': index + 1,
    'Roll Number': student.rollNumber,
    'Name': student.name,
    'Department': student.department,
    'Section': student.section,
    'Batch': student.batch,
    'CGPA': score,
    'Backlogs': getScopedBacklogCodes(student, query).length,
  }));

  if (type === 'toppers') {
    return rows.slice(0, parseInt(query.limit, 10) || 10);
  }

  return rows;
}

function buildRiskRows(students, query = {}) {
  const riskType = query.riskType || query.type || '';
  let rows = students.map(student => {
    const semesters = getScopedSemesters(student, query);
    const attendance = getScopedAttendance(student, query);
    if (hasScopedFilter(query) && !semesters.length && !attendance.length) return null;
    const cgpa = getScopedScore(student, query);
    const backlogs = getScopedBacklogCodes(student, query).length;
    const lowCgpa = cgpa < 6.0;
    const multiBacklog = backlogs >= 2;
    const lowAtt = attendance.some(a => a.percentage < 65);
    const riskFactors = [
      ...(lowCgpa ? [`Low CGPA (${cgpa})`] : []),
      ...(multiBacklog ? [`${backlogs} backlogs`] : []),
      ...(lowAtt ? ['Low attendance (<65%)'] : []),
    ];
    return {
      'Roll Number': student.rollNumber,
      'Name': student.name,
      'Department': student.department,
      'Section': student.section,
      'Batch': student.batch,
      'CGPA': cgpa,
      'Backlogs': backlogs,
      'Risk Score': riskFactors.length,
      'Risk Factors': riskFactors.join('; '),
      lowCgpa,
      multiBacklog,
      lowAtt,
    };
  }).filter(row => row && row['Risk Score'] > 0);

  if (riskType === 'low_cgpa') rows = rows.filter(row => row.lowCgpa);
  if (riskType === 'backlogs') rows = rows.filter(row => row.multiBacklog);
  if (riskType === 'low_attendance') rows = rows.filter(row => row.lowAtt);

  return rows
    .sort((a, b) => b['Risk Score'] - a['Risk Score'])
    .map(({ lowCgpa, multiBacklog, lowAtt, ...row }) => row);
}

function buildTopperRows(students, query = {}) {
  const limit = parseInt(query.limit, 10) || 10;
  return students
    .map(student => ({ student, score: getScopedScore(student, query) }))
    .filter(({ score }) => !hasScopedFilter(query) || score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ student, score }, index) => ({
      'Rank': index + 1,
      'Roll Number': student.rollNumber,
      'Name': student.name,
      'Department': student.department,
      'Section': student.section,
      'Batch': student.batch,
      'CGPA': score,
      'Backlogs': getScopedBacklogCodes(student, query).length,
      'Current Semester': student.currentSemester,
    }));
}

function buildScopedReportRows(reportType, students, query = {}) {
  if (!isBatchAcademicYearCompatible(query.batch, query.academicYear)) {
    return [];
  }

  switch (reportType) {
    case 'attendance':
      return buildAttendanceRows(students, query);
    case 'marks':
      return buildMarksRows(students, query);
    case 'backlogs':
      return buildBacklogRows(students, query);
    case 'cgpa':
      return buildCgpaRows(students, query);
    case 'risk':
      return buildRiskRows(students, query);
    case 'toppers':
      return buildTopperRows(students, query);
    default:
      return [];
  }
}

module.exports = {
  buildScopedReportRows,
};
