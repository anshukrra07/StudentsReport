require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';

const SUBJECTS = {
  CSE: {
    1: ['Calculus', 'Physics', 'Chemistry', 'Programming in C'],
    2: ['Data Structures', 'Digital Logic', 'Java Programming', 'Discrete Math'],
    3: ['DBMS', 'Operating Systems', 'Computer Organization', 'Statistics'],
    4: ['Computer Networks', 'Software Engineering', 'Web Technologies', 'Formal Languages'],
    5: ['Compiler Design', 'Machine Learning', 'Cloud Computing', 'Data Mining'],
    6: ['Artificial Intelligence', 'Big Data Analytics', 'Information Security', 'IoT'],
    7: ['Deep Learning', 'Distributed Systems', 'NLP', 'Blockchain'],
    8: ['Data Science', 'Edge Computing', 'Internship', 'Major Project'],
  },
  ECE: {
    1: ['Calculus', 'Physics', 'Chemistry', 'Basic Electrical Engineering'],
    2: ['Circuit Theory', 'Electronic Devices', 'Signals and Systems', 'C Programming'],
    3: ['Analog Circuits', 'Digital Electronics', 'Probability', 'Network Theory'],
    4: ['Communication Systems', 'Control Systems', 'Microcontrollers', 'Linear ICs'],
    5: ['VLSI Design', 'Digital Signal Processing', 'Embedded Systems', 'Antenna Theory'],
    6: ['Wireless Networks', 'Radar Systems', 'Microwave Engineering', 'Optical Communications'],
    7: ['Image Processing', 'Satellite Communication', 'IoT Systems', 'Project Phase I'],
    8: ['Internship', 'Major Project', 'Seminar', 'Elective'],
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(text) {
  return String(text || '').split('').reduce((acc, ch) => ((acc * 31) + ch.charCodeAt(0)) % 1000003, 7);
}

function academicYearFor(batch, semester) {
  const start = Number(String(batch || '').slice(0, 4));
  if (!Number.isFinite(start)) return '';
  const year = start + Math.floor((semester - 1) / 2);
  return `${year}-${year + 1}`;
}

function subjectListFor(department, semester) {
  const deptSubjects = SUBJECTS[department] || SUBJECTS.CSE;
  return deptSubjects[semester] || [`Subject ${semester}-A`, `Subject ${semester}-B`, `Subject ${semester}-C`, `Subject ${semester}-D`];
}

function buildSubjectCode(name, semester) {
  return `S${semester}_${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 10)}`;
}

function distributeBacklogs(currentSemester, backlogCount, subjectsPerSemester) {
  const allocation = new Array(currentSemester + 1).fill(0);
  let remaining = Math.max(0, Math.min(backlogCount, currentSemester * subjectsPerSemester));

  // Bias failures toward recent semesters, but ensure the requested total can
  // be represented as real failed subjects even for early-semester students.
  while (remaining > 0) {
    for (let semester = currentSemester; semester >= 1 && remaining > 0; semester--) {
      if (allocation[semester] >= subjectsPerSemester) continue;
      allocation[semester] += 1;
      remaining -= 1;
    }
  }

  return allocation;
}

function enrichStudent(student) {
  const seed = hashSeed(student.rollNumber);
  const currentSemester = clamp(Number(student.currentSemester) || 1, 1, 8);
  const backlogCount = (student.backlogs || []).length;
  const existingAttendanceAvg = (student.attendance || []).length
    ? (student.attendance.reduce((sum, item) => sum + (item.percentage || 0), 0) / student.attendance.length)
    : 78;
  const targetCgpa = clamp(Number(student.cgpa) || 7, 4.5, 9.8);
  const trendSlope = ((seed % 9) - 4) * 0.08;

  const generatedSemesters = [];
  const generatedAttendance = [];
  const backlogAllocation = distributeBacklogs(currentSemester, backlogCount, 4);

  for (let semester = 1; semester <= currentSemester; semester++) {
    const subjectNames = subjectListFor(student.department, semester);
    const academicYear = academicYearFor(student.batch, semester);
    const semesterWeight = currentSemester === 1 ? 0 : (semester - 1) / (currentSemester - 1);
    const sgpaBase = targetCgpa - (trendSlope * (currentSemester - semester));
    const sgpa = clamp(parseFloat((sgpaBase + ((seed + semester) % 5 - 2) * 0.07).toFixed(2)), 4.8, 9.8);
    const attendanceBase = clamp(existingAttendanceAvg - ((currentSemester - semester) * 1.4) + ((seed + semester) % 7 - 3), 58, 96);

    const semesterBacklogs = backlogAllocation[semester] || 0;

    const subjects = subjectNames.map((name, index) => {
      const subjectCode = buildSubjectCode(name, semester);
      const isBacklogSubject = index < semesterBacklogs;
      const total = isBacklogSubject
        ? clamp(28 + ((seed + semester + index) % 7), 26, 34)
        : clamp(Math.round((sgpa * 10) + ((seed + index + semester) % 13 - 6)), 42, 96);
      const internal = clamp(Math.round(total * 0.32), 10, 30);
      const external = clamp(total - internal, 15, 70);

      const attendancePct = clamp(parseFloat((attendanceBase + ((index % 3) - 1) * 3.5).toFixed(1)), 52, 98);
      const totalClasses = 60 + ((seed + semester + index) % 26);
      const attendedClasses = Math.round((attendancePct / 100) * totalClasses);

      generatedAttendance.push({
        subjectCode,
        subjectName: name,
        semester,
        totalClasses,
        attendedClasses,
        percentage: attendancePct,
        academicYear,
      });

      return {
        subjectCode,
        subjectName: name,
        internal,
        external,
        total,
        maxInternal: 30,
        maxExternal: 70,
        status: total >= 35 ? 'pass' : 'fail',
      };
    });

    const totalCredits = subjects.length * 4;
    const earnedCredits = subjects.filter(subject => subject.status === 'pass').length * 4;

    generatedSemesters.push({
      semNumber: semester,
      academicYear,
      subjects,
      sgpa,
      totalCredits,
      earnedCredits,
      result: earnedCredits === totalCredits ? 'pass' : 'fail',
    });
  }

  const failedCodes = [...new Set(generatedSemesters.flatMap(semester =>
    semester.subjects.filter(subject => subject.status === 'fail').map(subject => subject.subjectCode)
  ))];

  const recomputedCgpa = parseFloat((generatedSemesters.reduce((sum, semester) => sum + semester.sgpa, 0) / generatedSemesters.length).toFixed(2));

  student.semesters = generatedSemesters;
  student.attendance = generatedAttendance;
  student.backlogs = failedCodes;
  student.cgpa = recomputedCgpa;
  student.currentSemester = currentSemester;

  return student;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  await mongoose.connect(MONGO_URI);

  const students = await Student.find().sort({ rollNumber: 1 });
  let updated = 0;

  for (const student of students) {
    const needsEnrichment = force || (student.semesters || []).length <= 1 || (student.attendance || []).length <= 1;
    if (!needsEnrichment) continue;
    enrichStudent(student);
    updated++;
    if (!dryRun) {
      await student.save();
    }
  }

  console.log(JSON.stringify({
    totalStudents: students.length,
    enrichedStudents: updated,
    dryRun,
    mode: force ? 'force' : 'smart',
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
