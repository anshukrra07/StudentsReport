require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const Student = require('../models/Student');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';

const DEPARTMENTS = ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
const BATCHES = ['2021-2025', '2022-2026', '2023-2027', '2024-2028'];
const SECTIONS = ['A', 'B', 'C'];

const FIRST_NAMES = ['Aarav', 'Aditya', 'Ananya', 'Arjun', 'Deepa', 'Harsha', 'Kavya', 'Keerthi', 'Madhav', 'Meera', 'Nandini', 'Rahul', 'Ravi', 'Sai', 'Sita', 'Varun'];
const LAST_NAMES = ['Kumar', 'Patel', 'Rao', 'Reddy', 'Sharma', 'Singh', 'Verma', 'Nair', 'Devi', 'Menon', 'Iyer', 'Das'];

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
  EEE: {
    1: ['Calculus', 'Physics', 'Engineering Chemistry', 'Basic Electrical Engineering'],
    2: ['Network Analysis', 'Electronic Devices', 'Programming', 'Engineering Mechanics'],
    3: ['Electrical Machines I', 'Measurements', 'Analog Electronics', 'Probability'],
    4: ['Electrical Machines II', 'Power Systems I', 'Signals and Systems', 'Control Systems'],
    5: ['Power Electronics', 'Power Systems II', 'Microprocessors', 'Electromagnetic Fields'],
    6: ['Digital Signal Processing', 'Renewable Energy Systems', 'Protection and Switchgear', 'Utilisation of Electrical Energy'],
    7: ['High Voltage Engineering', 'Smart Grids', 'Industrial Drives', 'Project Phase I'],
    8: ['Internship', 'Major Project', 'Seminar', 'Elective'],
  },
  MECH: {
    1: ['Calculus', 'Physics', 'Engineering Chemistry', 'Engineering Graphics'],
    2: ['Thermodynamics', 'Manufacturing Processes', 'Material Science', 'Programming'],
    3: ['Fluid Mechanics', 'Kinematics of Machines', 'Strength of Materials', 'Metrology'],
    4: ['Heat Transfer', 'Dynamics of Machines', 'Machine Design', 'Production Technology'],
    5: ['Finite Element Methods', 'IC Engines', 'Refrigeration and AC', 'Industrial Engineering'],
    6: ['CAD/CAM', 'Robotics', 'Power Plant Engineering', 'Automation'],
    7: ['Automobile Engineering', 'Composite Materials', 'Operations Research', 'Project Phase I'],
    8: ['Internship', 'Major Project', 'Seminar', 'Elective'],
  },
  CIVIL: {
    1: ['Calculus', 'Physics', 'Engineering Chemistry', 'Engineering Mechanics'],
    2: ['Surveying', 'Building Materials', 'Programming', 'Fluid Mechanics'],
    3: ['Structural Analysis', 'Concrete Technology', 'Geotechnical Engineering', 'Transportation Engineering'],
    4: ['Design of RC Structures', 'Hydrology', 'Environmental Engineering', 'Construction Planning'],
    5: ['Steel Structures', 'Foundation Engineering', 'Irrigation Engineering', 'Quantity Surveying'],
    6: ['Bridge Engineering', 'Remote Sensing and GIS', 'Water Resources Engineering', 'Estimation and Costing'],
    7: ['Advanced Structural Design', 'Pavement Design', 'Disaster Management', 'Project Phase I'],
    8: ['Internship', 'Major Project', 'Seminar', 'Elective'],
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(text) {
  return String(text || '').split('').reduce((acc, ch) => ((acc * 33) + ch.charCodeAt(0)) % 10000019, 11);
}

function academicYearFor(batch, semester) {
  const [start] = String(batch || '').split('-').map(Number);
  const year = start + Math.floor((semester - 1) / 2);
  return `${year}-${year + 1}`;
}

function buildSubjectCode(name, semester) {
  return `S${semester}_${String(name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 10)}`;
}

function getName(seed) {
  const first = FIRST_NAMES[seed % FIRST_NAMES.length];
  const last = LAST_NAMES[Math.floor(seed / FIRST_NAMES.length) % LAST_NAMES.length];
  return `${first} ${last}`;
}

function distributeBacklogs(seed) {
  const total = seed % 5;
  const map = new Array(9).fill(0);
  let remaining = total;
  let semester = 8;
  while (remaining > 0 && semester >= 1) {
    map[semester] += 1;
    remaining -= 1;
    semester -= 1;
  }
  return map;
}

function buildStudent({ department, batch, section, serial }) {
  const batchStart = Number(batch.slice(2, 4));
  const deptCode = department.slice(0, 2);
  const rollNumber = `SIM${deptCode}${batchStart}${section}${String(serial).padStart(2, '0')}`;
  const seed = hashSeed(rollNumber);
  const name = getName(seed);
  const backlogPlan = distributeBacklogs(seed);
  const targetCgpa = clamp(6.1 + ((seed % 31) / 10), 6.1, 9.2);
  const baseAttendance = clamp(68 + (seed % 22), 68, 89);

  const semesters = [];
  const attendance = [];

  for (let semester = 1; semester <= 8; semester++) {
    const academicYear = academicYearFor(batch, semester);
    const names = SUBJECTS[department][semester];
    const sgpa = clamp(parseFloat((targetCgpa - ((8 - semester) * 0.08) + (((seed + semester) % 5) - 2) * 0.11).toFixed(2)), 5.8, 9.6);
    const backlogCount = backlogPlan[semester] || 0;

    const subjects = names.map((subjectName, index) => {
      const subjectCode = buildSubjectCode(subjectName, semester);
      const failed = index < backlogCount;
      const total = failed
        ? clamp(27 + ((seed + semester + index) % 8), 24, 34)
        : clamp(Math.round((sgpa * 10) + (((seed + semester + index) % 15) - 7)), 41, 95);
      const internal = clamp(Math.round(total * 0.32), 9, 30);
      const external = clamp(total - internal, 14, 70);

      const percentage = clamp(parseFloat((baseAttendance + ((index % 2 === 0) ? -3.5 : 2.2) + ((semester - 4) * 0.6)).toFixed(1)), 58, 95);
      const totalClasses = 62 + ((seed + semester + index) % 20);
      const attendedClasses = Math.round((percentage / 100) * totalClasses);

      attendance.push({
        subjectCode,
        subjectName,
        semester,
        academicYear,
        totalClasses,
        attendedClasses,
        percentage,
      });

      return {
        subjectCode,
        subjectName,
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

    semesters.push({
      semNumber: semester,
      academicYear,
      subjects,
      sgpa,
      totalCredits,
      earnedCredits,
      result: earnedCredits === totalCredits ? 'pass' : 'fail',
    });
  }

  const cgpa = parseFloat((semesters.reduce((sum, semester) => sum + semester.sgpa, 0) / semesters.length).toFixed(2));
  const backlogs = [...new Set(semesters.flatMap(semester =>
    semester.subjects.filter(subject => subject.status === 'fail').map(subject => subject.subjectCode)
  ))];

  return {
    rollNumber,
    name,
    department,
    section,
    batch,
    currentSemester: 8,
    cgpa,
    semesters,
    attendance,
    backlogs,
    email: `${rollNumber.toLowerCase()}@vfstr.demo`,
    phone: `9${String(100000000 + (seed % 899999999)).padStart(9, '0')}`,
    isActive: true,
  };
}

function hasCoverageJourney(student) {
  const semesterNumbers = new Set((student.semesters || []).map(semester => semester.semNumber));
  if (semesterNumbers.size < 8) return false;
  for (let semester = 1; semester <= 8; semester++) {
    if (!semesterNumbers.has(semester)) return false;
  }
  return (student.attendance || []).length >= 32;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const targetPerGroup = Math.max(1, parseInt(process.env.COVERAGE_STUDENTS_PER_GROUP || '3', 10));

  await mongoose.connect(MONGO_URI);

  const existing = await Student.find({}, 'rollNumber department batch section semesters attendance').lean();
  const existingRolls = new Set(existing.map(student => student.rollNumber));

  const operations = [];
  const createdGroups = [];

  for (const department of DEPARTMENTS) {
    for (const batch of BATCHES) {
      for (const section of SECTIONS) {
        const covered = existing.filter(student =>
          student.department === department &&
          student.batch === batch &&
          student.section === section &&
          hasCoverageJourney(student)
        ).length;

        const missing = Math.max(0, targetPerGroup - covered);
        if (!missing) continue;

        createdGroups.push({ department, batch, section, missing });

        let serial = 1;
        let created = 0;
        while (created < missing) {
          const doc = buildStudent({ department, batch, section, serial });
          serial += 1;
          if (existingRolls.has(doc.rollNumber)) continue;
          existingRolls.add(doc.rollNumber);
          operations.push({ insertOne: { document: doc } });
          created += 1;
        }
      }
    }
  }

  if (!dryRun && operations.length) {
    await Student.bulkWrite(operations);
  }

  console.log(JSON.stringify({
    dryRun,
    targetPerGroup,
    insertedStudents: operations.length,
    groupsBackfilled: createdGroups.length,
    sampleGroups: createdGroups.slice(0, 20),
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
