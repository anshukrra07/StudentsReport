require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const XLSX = require('xlsx');

const User = require('../models/User');
const Student = require('../models/Student');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';
const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || 'Welcome@123';
const DEFAULT_DOMAIN = process.env.IMPORT_EMAIL_DOMAIN || 'college.edu';

const SUBJECT_NAME_MAP = {
  DBMS: 'Database Management Systems',
  OS: 'Operating Systems',
  DSA: 'Data Structures and Algorithms',
  CN: 'Computer Networks',
  AI: 'Artificial Intelligence',
  ML: 'Machine Learning',
  MATHS: 'Mathematics',
  MATH: 'Mathematics',
  JAVA: 'Java Programming',
  PYTHON: 'Python Programming',
  C: 'C Programming',
  OOPS: 'Object Oriented Programming',
  SE: 'Software Engineering',
  TOC: 'Theory of Computation',
  COA: 'Computer Organization and Architecture',
};

function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getValue(row, aliases) {
  const lookup = {};
  for (const [key, value] of Object.entries(row || {})) {
    lookup[normalizeKey(key)] = value;
  }
  for (const alias of aliases) {
    const found = lookup[normalizeKey(alias)];
    if (found !== undefined && found !== null && String(found).trim() !== '') return found;
  }
  return '';
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toInt(value, fallback = 0) {
  return Math.round(toNumber(value, fallback));
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeDepartment(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeSection(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeResult(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('detain')) return 'detained';
  if (text.includes('fail')) return 'fail';
  return 'pass';
}

function normalizeStatus(value, total) {
  const text = String(value || '').trim().toLowerCase();
  if (text.includes('absent')) return 'absent';
  if (text.includes('fail')) return 'fail';
  return total >= 35 ? 'pass' : 'fail';
}

function normalizeBatch(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{4}$/.test(text)) return text;
  if (/^\d{4}$/.test(text)) {
    const start = Number(text);
    return `${start}-${start + 4}`;
  }
  return text;
}

function academicYearFor(batch, semester) {
  const text = normalizeBatch(batch);
  const start = Number(String(text).slice(0, 4));
  if (!Number.isFinite(start) || !semester) return '';
  const year = start + Math.floor((semester - 1) / 2);
  return `${year}-${year + 1}`;
}

function deriveSubjectCode(subjectName) {
  const base = String(subjectName || 'GENERAL')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 12);
  return `SUB_${base || 'GENERAL'}`;
}

function deriveSubjectName(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'General Subject';
  const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (SUBJECT_NAME_MAP[key]) return SUBJECT_NAME_MAP[key];
  if (raw === raw.toUpperCase() && raw.length <= 10) {
    return raw
      .split(/[_\-\s]+/)
      .filter(Boolean)
      .map(part => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ');
  }
  return titleCase(raw);
}

function deriveInternal(total) {
  return Math.max(0, Math.min(30, Math.round(total * 0.3)));
}

function deriveExternal(total, internal) {
  return Math.max(0, Math.min(70, total - internal));
}

function mapDesignationToRole(designation) {
  const text = String(designation || '').trim().toLowerCase();
  if (text.includes('hod')) return 'hod';
  if (text.includes('faculty')) return 'faculty';
  if (text.includes('admin')) return 'admin';
  if (text.includes('bosa') || text.includes('deo') || text.includes('office')) return 'deo';
  return 'faculty';
}

function buildUsername(role, department, empcode) {
  const dept = String(department || 'general').toLowerCase().replace(/[^a-z0-9]/g, '');
  const code = String(empcode || '').trim().replace(/[^a-zA-Z0-9]/g, '');
  return `${role}_${dept}_${code || 'user'}`;
}

function buildStaffName(designation, empcode) {
  const title = titleCase(designation || 'Staff');
  return empcode ? `${title} ${empcode}` : title;
}

function generateEmail(prefix, domain = DEFAULT_DOMAIN) {
  const safePrefix = String(prefix || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `${safePrefix || 'user'}@${domain}`;
}

function generateStudentPhone(seed) {
  const text = String(seed || '0');
  let hash = 0;
  for (const ch of text) hash = (hash * 31 + ch.charCodeAt(0)) % 1000000000;
  return `9${String(hash).padStart(9, '0')}`;
}

function pickSheet(workbook, pattern) {
  return workbook.SheetNames.find(name => pattern.test(name));
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(arg => !arg.startsWith('--'));
  const replace = args.includes('--replace');
  const dryRun = args.includes('--dry-run');

  if (!filePath) {
    console.error('Usage: node import/importCollegeWorkbook.js <file.xlsx> [--replace] [--dry-run]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(filePath);
  const workbook = XLSX.readFile(resolvedPath);
  const staffSheet = pickSheet(workbook, /staff/i);
  const studentSheet = pickSheet(workbook, /student/i);

  if (!studentSheet) {
    throw new Error('Could not find a student sheet in the workbook');
  }

  const staffRows = staffSheet
    ? XLSX.utils.sheet_to_json(workbook.Sheets[staffSheet], { defval: '' })
    : [];
  const studentRows = XLSX.utils.sheet_to_json(workbook.Sheets[studentSheet], { defval: '' });

  const importedUsers = staffRows
    .map(row => {
      const empcode = getValue(row, ['empcode', 'employeecode', 'id']);
      const designation = getValue(row, ['designation', 'designated', 'role']);
      const department = normalizeDepartment(getValue(row, ['department']));
      const email = getValue(row, ['email', 'mail']);
      if (!empcode || !designation || !department) return null;
      const role = mapDesignationToRole(designation);
      return {
        username: buildUsername(role, department, empcode),
        password: DEFAULT_PASSWORD,
        name: buildStaffName(designation, empcode),
        role,
        department,
        email: String(email || '').trim() || generateEmail(`${role}${department}${empcode}`),
        isActive: true,
      };
    })
    .filter(Boolean);

  const users = [...importedUsers];

  if (!users.some(user => user.role === 'admin')) {
    users.unshift({
      username: 'admin',
      password: DEFAULT_PASSWORD,
      name: 'System Administrator',
      role: 'admin',
      department: 'Admin',
      email: generateEmail('admin'),
      isActive: true,
    });
  }

  const seenUsernames = new Set(users.map(user => user.username));
  for (const user of importedUsers) {
    if (user.role === 'admin') continue;
    const alias = `${user.role}_${String(user.department || '').toLowerCase()}`;
    if (!alias || seenUsernames.has(alias)) continue;
    users.push({ ...user, username: alias });
    seenUsernames.add(alias);
  }

  const studentMap = new Map();

  for (const row of studentRows) {
    const rollNumber = String(getValue(row, ['registerno', 'rollnumber', 'rollno'])).trim();
    if (!rollNumber) continue;

    const name = String(getValue(row, ['name', 'studentname'])).trim();
    const department = normalizeDepartment(getValue(row, ['department']));
    const section = normalizeSection(getValue(row, ['sectioncode', 'section']));
    const batch = normalizeBatch(getValue(row, ['batch']));
    const semester = toInt(getValue(row, ['semester', 'sem']), 0);
    const subjectRaw = getValue(row, ['shortname', 'subjectname', 'subject']);
    const subjectName = deriveSubjectName(subjectRaw);
    const subjectCode = deriveSubjectCode(subjectName);
    const attendancePct = toNumber(getValue(row, ['attendance%', 'attendance']), 0);
    const totalMarks = toNumber(getValue(row, ['marks', 'totalmarks']), 0);
    const cgpa = toNumber(getValue(row, ['cgpa']), 0);
    const result = normalizeResult(getValue(row, ['result']));
    const backlogCount = Math.max(0, toInt(getValue(row, ['backlogs', 'backlog']), 0));
    const academicYear = academicYearFor(batch, semester);
    const internal = deriveInternal(totalMarks);
    const external = deriveExternal(totalMarks, internal);
    const status = normalizeStatus(result, totalMarks);

    if (!studentMap.has(rollNumber)) {
      studentMap.set(rollNumber, {
        rollNumber,
        name,
        department,
        section,
        batch,
        currentSemester: semester,
        cgpa,
        semestersMap: new Map(),
        attendanceMap: new Map(),
        backlogCount,
      });
    }

    const student = studentMap.get(rollNumber);
    student.name = student.name || name;
    student.department = student.department || department;
    student.section = student.section || section;
    student.batch = student.batch || batch;
    student.currentSemester = Math.max(student.currentSemester || 0, semester || 0);
    student.cgpa = Math.max(student.cgpa || 0, cgpa || 0);
    student.backlogCount = Math.max(student.backlogCount || 0, backlogCount);

    const semKey = String(semester || 0);
    if (!student.semestersMap.has(semKey)) {
      student.semestersMap.set(semKey, {
        semNumber: semester,
        academicYear,
        subjects: [],
        result,
      });
    }

    const semEntry = student.semestersMap.get(semKey);
    if (!semEntry.subjects.some(subject => subject.subjectCode === subjectCode)) {
      semEntry.subjects.push({
        subjectCode,
        subjectName,
        internal,
        external,
        total: totalMarks,
        maxInternal: 30,
        maxExternal: 70,
        status,
      });
    }
    if (status === 'fail') semEntry.result = 'fail';

    if (!student.attendanceMap.has(subjectCode)) {
      const totalClasses = 100;
      const attendedClasses = Math.round((attendancePct / 100) * totalClasses);
      student.attendanceMap.set(subjectCode, {
        subjectCode,
        subjectName,
        semester,
        totalClasses,
        attendedClasses,
        percentage: attendancePct,
        academicYear,
      });
    }
  }

  const students = Array.from(studentMap.values()).map(student => {
    const semesters = Array.from(student.semestersMap.values())
      .sort((a, b) => a.semNumber - b.semNumber)
      .map(sem => {
        const totalCredits = sem.subjects.length * 4;
        const earnedCredits = sem.subjects.filter(subject => subject.status === 'pass').length * 4;
        return {
          semNumber: sem.semNumber,
          academicYear: sem.academicYear,
          subjects: sem.subjects,
          sgpa: student.cgpa || 0,
          totalCredits,
          earnedCredits,
          result: sem.result === 'fail' ? 'fail' : 'pass',
        };
      });

    const failedSubjectCodes = semesters.flatMap(sem =>
      sem.subjects.filter(subject => subject.status === 'fail').map(subject => subject.subjectCode)
    );
    const backlogs = Array.from(new Set(failedSubjectCodes));
    while (backlogs.length < (student.backlogCount || 0)) {
      backlogs.push(`BACKLOG_${backlogs.length + 1}`);
    }

    return {
      rollNumber: student.rollNumber,
      name: student.name || student.rollNumber,
      department: student.department || 'GENERAL',
      section: student.section || '',
      batch: student.batch || '',
      currentSemester: student.currentSemester || 0,
      cgpa: student.cgpa || 0,
      semesters,
      attendance: Array.from(student.attendanceMap.values()),
      backlogs,
      email: generateEmail(student.rollNumber),
      phone: generateStudentPhone(student.rollNumber),
      isActive: true,
    };
  });

  console.log(`Workbook: ${resolvedPath}`);
  console.log(`Staff rows: ${staffRows.length}`);
  console.log(`Student rows: ${studentRows.length}`);
  console.log(`Users prepared: ${users.length}`);
  console.log(`Students prepared: ${students.length}`);
  console.log(`Default imported user password: ${DEFAULT_PASSWORD}`);
  console.log(`Sample usernames: ${users.slice(0, 5).map(user => user.username).join(', ')}`);

  if (dryRun) return;

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  if (replace) {
    await User.deleteMany({});
    await Student.deleteMany({});
    console.log('Existing users and students cleared');
  }

  for (const user of users) {
    await User.findOneAndDelete({ username: user.username });
    const doc = new User(user);
    await doc.save();
  }

  for (const student of students) {
    await Student.findOneAndUpdate(
      { rollNumber: student.rollNumber },
      { $set: student },
      { upsert: true, runValidators: true }
    );
  }

  console.log(`Imported ${users.length} users and ${students.length} students`);
  await mongoose.disconnect();
}

main().catch(async err => {
  console.error(err.message || err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
