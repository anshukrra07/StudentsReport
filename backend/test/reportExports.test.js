const test = require('node:test');
const assert = require('node:assert/strict');

const { buildScopedReportRows } = require('../lib/reportExports');

function makeStudent(overrides = {}) {
  return {
    rollNumber: '22B81A001',
    name: 'Student One',
    department: 'CSE',
    section: 'A',
    batch: '2022-2026',
    currentSemester: 8,
    cgpa: 8.12,
    backlogs: [],
    semesters: [],
    attendance: [],
    ...overrides,
  };
}

function semester(semNumber, academicYear, sgpa, subjects) {
  return {
    semNumber,
    academicYear,
    sgpa,
    totalCredits: subjects.length * 4,
    earnedCredits: subjects.filter(subject => subject.status === 'pass').length * 4,
    result: subjects.every(subject => subject.status === 'pass') ? 'pass' : 'fail',
    subjects,
  };
}

function subject(code, total, status = total >= 35 ? 'pass' : 'fail') {
  return {
    subjectCode: code,
    subjectName: code,
    internal: Math.min(30, Math.round(total * 0.3)),
    external: Math.max(0, total - Math.min(30, Math.round(total * 0.3))),
    total,
    maxInternal: 30,
    maxExternal: 70,
    status,
  };
}

function attendance(subjectCode, semesterNumber, academicYear, percentage) {
  const totalClasses = 60;
  return {
    subjectCode,
    subjectName: subjectCode,
    semester: semesterNumber,
    academicYear,
    totalClasses,
    attendedClasses: Math.round((percentage / 100) * totalClasses),
    percentage,
  };
}

test('cgpa ranking keeps students with historical semester data even when currentSemester is higher', () => {
  const students = [
    makeStudent({
      rollNumber: '22B81A001',
      currentSemester: 8,
      semesters: [
        semester(7, '2025-2026', 8.9, [
          subject('S7_A', 82),
          subject('S7_B', 77),
          subject('S7_C', 73),
          subject('S7_D', 68),
        ]),
        semester(8, '2025-2026', 8.2, [
          subject('S8_A', 75),
          subject('S8_B', 71),
          subject('S8_C', 69),
          subject('S8_D', 72),
        ]),
      ],
      attendance: [
        attendance('S7_A', 7, '2025-2026', 82),
        attendance('S7_B', 7, '2025-2026', 78),
      ],
    }),
    makeStudent({
      rollNumber: '22B81A002',
      currentSemester: 7,
      cgpa: 7.8,
      semesters: [
        semester(7, '2025-2026', 7.6, [
          subject('S7_E', 79),
          subject('S7_F', 66),
          subject('S7_G', 61),
          subject('S7_H', 58),
        ]),
      ],
      attendance: [
        attendance('S7_E', 7, '2025-2026', 76),
      ],
    }),
  ];

  const rows = buildScopedReportRows('cgpa', students, {
    type: 'ranking',
    batch: '2022-2026',
    academicYear: '2025-2026',
    semester: '7',
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row['Roll Number']), ['22B81A001', '22B81A002']);
});

test('backlog export rows use scoped failed subjects and pending credits', () => {
  const students = [
    makeStudent({
      rollNumber: '22B81A010',
      backlogs: ['S7_FAIL_A', 'S8_FAIL_B'],
      semesters: [
        semester(7, '2025-2026', 6.4, [
          subject('S7_FAIL_A', 28, 'fail'),
          subject('S7_PASS_B', 61),
          subject('S7_PASS_C', 67),
          subject('S7_PASS_D', 72),
        ]),
        semester(8, '2025-2026', 8.0, [
          subject('S8_FAIL_B', 31, 'fail'),
          subject('S8_PASS_B', 70),
          subject('S8_PASS_C', 74),
          subject('S8_PASS_D', 79),
        ]),
      ],
      attendance: [
        attendance('S7_FAIL_A', 7, '2025-2026', 58),
        attendance('S7_PASS_B', 7, '2025-2026', 74),
      ],
    }),
  ];

  const rows = buildScopedReportRows('backlogs', students, {
    batch: '2022-2026',
    academicYear: '2025-2026',
    semester: '7',
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]['Backlog Count'], 1);
  assert.equal(rows[0]['Backlog Codes'], 'S7_FAIL_A');
  assert.equal(rows[0]['Pending Credits'], 4);
});

test('risk export rows stay scoped to the selected semester history', () => {
  const students = [
    makeStudent({
      rollNumber: '22B81A020',
      cgpa: 7.5,
      backlogs: ['S7_LOW_A'],
      semesters: [
        semester(7, '2025-2026', 5.8, [
          subject('S7_LOW_A', 26, 'fail'),
          subject('S7_LOW_B', 48),
          subject('S7_LOW_C', 55),
          subject('S7_LOW_D', 58),
        ]),
        semester(8, '2025-2026', 8.9, [
          subject('S8_HIGH_A', 85),
          subject('S8_HIGH_B', 81),
          subject('S8_HIGH_C', 83),
          subject('S8_HIGH_D', 79),
        ]),
      ],
      attendance: [
        attendance('S7_LOW_A', 7, '2025-2026', 59),
        attendance('S7_LOW_B', 7, '2025-2026', 61),
        attendance('S8_HIGH_A', 8, '2025-2026', 96),
      ],
    }),
  ];

  const semesterSevenRows = buildScopedReportRows('risk', students, {
    batch: '2022-2026',
    academicYear: '2025-2026',
    semester: '7',
  });
  const semesterEightRows = buildScopedReportRows('risk', students, {
    batch: '2022-2026',
    academicYear: '2025-2026',
    semester: '8',
  });

  assert.equal(semesterSevenRows.length, 1);
  assert.equal(semesterSevenRows[0]['Backlogs'], 1);
  assert.match(semesterSevenRows[0]['Risk Factors'], /Low CGPA/);
  assert.match(semesterSevenRows[0]['Risk Factors'], /Low attendance/);
  assert.equal(semesterEightRows.length, 0);
});

test('topper export rows respect requested limit', () => {
  const students = [
    makeStudent({
      rollNumber: '22B81A101',
      semesters: [semester(7, '2025-2026', 9.6, [subject('A', 90), subject('B', 88), subject('C', 84), subject('D', 80)])],
    }),
    makeStudent({
      rollNumber: '22B81A102',
      semesters: [semester(7, '2025-2026', 9.2, [subject('A2', 88), subject('B2', 83), subject('C2', 82), subject('D2', 81)])],
    }),
    makeStudent({
      rollNumber: '22B81A103',
      semesters: [semester(7, '2025-2026', 8.8, [subject('A3', 82), subject('B3', 80), subject('C3', 78), subject('D3', 76)])],
    }),
  ];

  const rows = buildScopedReportRows('toppers', students, {
    batch: '2022-2026',
    academicYear: '2025-2026',
    semester: '7',
    limit: '2',
  });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.Rank), [1, 2]);
});
