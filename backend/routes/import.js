/**
 * routes/import.js
 *
 * POST /api/import/upload   — parse + validate + upsert students from Excel
 * POST /api/import/preview  — dry-run: validate only, return row errors without saving
 *
 * Accepts multipart/form-data with field name: "file"
 * Admin-only (or deo for their own department).
 *
 * Install: npm install multer xlsx  (both already in package.json)
 */

const router   = require('express').Router();
const multer   = require('multer');
const XLSX     = require('xlsx');
const Student  = require('../models/Student');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../lib/auditLogger');
const { invalidateCache } = require('../middleware/cache');

router.use(authenticate);

// ── Multer: memory storage, 10 MB limit, xlsx/xls only ───────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only .xlsx or .xls files are accepted'), ok);
  },
});

// ── Helpers (mirrors importCollegeWorkbook.js) ────────────────────────────
const SUBJECT_NAME_MAP = {
  DBMS:'Database Management Systems', OS:'Operating Systems',
  DSA:'Data Structures and Algorithms', CN:'Computer Networks',
  AI:'Artificial Intelligence', ML:'Machine Learning',
  MATHS:'Mathematics', MATH:'Mathematics', JAVA:'Java Programming',
  PYTHON:'Python Programming', C:'C Programming',
  OOPS:'Object Oriented Programming', SE:'Software Engineering',
  TOC:'Theory of Computation', COA:'Computer Organization and Architecture',
};

function nk(v) { return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

function get(row, aliases) {
  const lookup = {};
  for (const [k,v] of Object.entries(row||{})) lookup[nk(k)] = v;
  for (const a of aliases) {
    const f = lookup[nk(a)];
    if (f !== undefined && f !== null && String(f).trim() !== '') return f;
  }
  return '';
}

function toNum(v, fb=0) { const n=Number(v); return Number.isFinite(n)?n:fb; }
function toInt(v, fb=0) { return Math.round(toNum(v,fb)); }

function normDept(v)    { return String(v||'').trim().toUpperCase(); }
function normSect(v)    { return String(v||'').trim().toUpperCase(); }
function normBatch(v) {
  const t=String(v||'').trim();
  if (/^\d{4}-\d{4}$/.test(t)) return t;
  if (/^\d{4}$/.test(t)) { const s=Number(t); return `${s}-${s+4}`; }
  return t;
}
function normResult(v) {
  const t=String(v||'').trim().toLowerCase();
  if (t.includes('detain')) return 'detained';
  if (t.includes('fail'))   return 'fail';
  return 'pass';
}
function normStatus(v,total) {
  const t=String(v||'').trim().toLowerCase();
  if (t.includes('absent')) return 'absent';
  if (t.includes('fail'))   return 'fail';
  return total>=35?'pass':'fail';
}
function academicYearFor(batch,semester) {
  const t=normBatch(batch), start=Number(String(t).slice(0,4));
  if (!Number.isFinite(start)||!semester) return '';
  const y=start+Math.floor((semester-1)/2);
  return `${y}-${y+1}`;
}
function deriveSubjectCode(name) {
  const b=String(name||'GENERAL').toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,12);
  return `SUB_${b||'GENERAL'}`;
}
function deriveSubjectName(v) {
  const raw=String(v||'').trim();
  if (!raw) return 'General Subject';
  const key=raw.toUpperCase().replace(/[^A-Z0-9]/g,'');
  if (SUBJECT_NAME_MAP[key]) return SUBJECT_NAME_MAP[key];
  if (raw===raw.toUpperCase()&&raw.length<=10)
    return raw.split(/[_\-\s]+/).filter(Boolean).map(p=>p[0]+p.slice(1).toLowerCase()).join(' ');
  return raw.split(/\s+/).filter(Boolean).map(p=>p[0].toUpperCase()+p.slice(1).toLowerCase()).join(' ');
}
function genEmail(roll) { return `${String(roll||'').toLowerCase().replace(/[^a-z0-9]/g,'')}@vfstr.ac.in`; }
function genPhone(seed) {
  const t=String(seed||'0'); let h=0;
  for (const ch of t) h=(h*31+ch.charCodeAt(0))%1000000000;
  return `9${String(h).padStart(9,'0')}`;
}

// ── Required columns ──────────────────────────────────────────────────────
const REQUIRED = [
  { aliases:['registerno','rollnumber','rollno'], label:'Roll Number' },
  { aliases:['name','studentname'],               label:'Name' },
  { aliases:['department'],                        label:'Department' },
  { aliases:['batch'],                             label:'Batch' },
];

// ── Validate a single row ─────────────────────────────────────────────────
function validateRow(row, rowIdx) {
  const errs = [];
  for (const {aliases, label} of REQUIRED) {
    const v = get(row, aliases);
    if (!v || !String(v).trim()) errs.push(`Missing ${label}`);
  }
  const roll = String(get(row,['registerno','rollnumber','rollno'])||'').trim();
  if (roll && !/^[A-Z0-9\-_]{4,20}$/i.test(roll))
    errs.push(`Invalid roll number format: "${roll}"`);
  const cgpa = toNum(get(row,['cgpa']),null);
  if (cgpa!==null && cgpa!=='' && (cgpa<0||cgpa>10))
    errs.push(`CGPA out of range: ${cgpa}`);
  const att = toNum(get(row,['attendance%','attendance']),null);
  if (att!==null && att!=='' && (att<0||att>100))
    errs.push(`Attendance % out of range: ${att}`);
  const sem = toInt(get(row,['semester','sem']),null);
  if (sem!==null && sem!=='' && (sem<1||sem>8))
    errs.push(`Semester out of range: ${sem}`);
  const batch = normBatch(get(row,['batch']));
  if (batch && !/^\d{4}-\d{4}$/.test(batch))
    errs.push(`Batch format must be YYYY-YYYY, got "${batch}"`);
  return { row:rowIdx+2, roll, errs };
}

// ── Parse rows → student documents ───────────────────────────────────────
function parseRows(rows) {
  const studentMap = new Map();

  for (const row of rows) {
    const rollNumber = String(get(row,['registerno','rollnumber','rollno'])||'').trim();
    if (!rollNumber) continue;

    const name       = String(get(row,['name','studentname'])||'').trim();
    const department = normDept(get(row,['department']));
    const section    = normSect(get(row,['sectioncode','section']));
    const batch      = normBatch(get(row,['batch']));
    const semester   = toInt(get(row,['semester','sem']),0);
    const subjectRaw = get(row,['shortname','subjectname','subject']);
    const subjectName= deriveSubjectName(subjectRaw);
    const subjectCode= deriveSubjectCode(subjectName);
    const attPct     = toNum(get(row,['attendance%','attendance']),0);
    const totalMarks = toNum(get(row,['marks','totalmarks']),0);
    const cgpa       = toNum(get(row,['cgpa']),0);
    const result     = normResult(get(row,['result']));
    const backlogCount = Math.max(0,toInt(get(row,['backlogs','backlog']),0));
    const academicYear = academicYearFor(batch,semester);
    const internal   = Math.max(0,Math.min(30,Math.round(totalMarks*0.3)));
    const external   = Math.max(0,Math.min(70,totalMarks-internal));
    const status     = normStatus(result,totalMarks);

    if (!studentMap.has(rollNumber)) {
      studentMap.set(rollNumber,{
        rollNumber, name, department, section, batch,
        currentSemester:semester, cgpa, semestersMap:new Map(),
        attendanceMap:new Map(), backlogCount,
      });
    }

    const s = studentMap.get(rollNumber);
    if (!s.name)           s.name       = name;
    if (!s.department)     s.department = department;
    if (!s.section)        s.section    = section;
    if (!s.batch)          s.batch      = batch;
    s.currentSemester = Math.max(s.currentSemester||0, semester||0);
    s.cgpa            = Math.max(s.cgpa||0, cgpa||0);
    s.backlogCount    = Math.max(s.backlogCount||0, backlogCount);

    if (semester>0) {
      const semKey = String(semester);
      if (!s.semestersMap.has(semKey))
        s.semestersMap.set(semKey,{semNumber:semester,academicYear,subjects:[],result});
      const se = s.semestersMap.get(semKey);
      if (subjectRaw && !se.subjects.some(x=>x.subjectCode===subjectCode)) {
        se.subjects.push({subjectCode,subjectName,internal,external,total:totalMarks,
          maxInternal:30,maxExternal:70,status});
      }
      if (status==='fail') se.result='fail';
      if (attPct>0 && !s.attendanceMap.has(subjectCode)) {
        const total=100, attended=Math.round((attPct/100)*total);
        s.attendanceMap.set(subjectCode,{subjectCode,subjectName,semester,totalClasses:total,
          attendedClasses:attended,percentage:attPct,academicYear});
      }
    }
  }

  return Array.from(studentMap.values()).map(s => {
    const semesters = Array.from(s.semestersMap.values())
      .sort((a,b)=>a.semNumber-b.semNumber)
      .map(sem=>{
        const totalCredits  = sem.subjects.length*4;
        const earnedCredits = sem.subjects.filter(x=>x.status==='pass').length*4;
        const failCodes     = sem.subjects.filter(x=>x.status==='fail').map(x=>x.subjectCode);
        const sgpa = sem.subjects.length
          ? parseFloat((sem.subjects.reduce((acc,x)=>{
              const pts = x.total>=80?10:x.total>=70?9:x.total>=60?8:x.total>=50?7:x.total>=45?6:x.total>=35?5:0;
              return acc+pts;
            },0)/sem.subjects.length).toFixed(2))
          : (s.cgpa||0);
        return {semNumber:sem.semNumber,academicYear:sem.academicYear,subjects:sem.subjects,
          sgpa,totalCredits,earnedCredits,result:failCodes.length?'fail':'pass'};
      });

    const backlogs = Array.from(new Set(
      semesters.flatMap(sem=>sem.subjects.filter(x=>x.status==='fail').map(x=>x.subjectCode))
    ));
    while (backlogs.length<(s.backlogCount||0)) backlogs.push(`BACKLOG_${backlogs.length+1}`);

    return {
      rollNumber:s.rollNumber, name:s.name||s.rollNumber,
      department:s.department||'GENERAL', section:s.section||'',
      batch:s.batch||'', currentSemester:s.currentSemester||0,
      cgpa:s.cgpa||0, semesters,
      attendance:Array.from(s.attendanceMap.values()),
      backlogs, email:genEmail(s.rollNumber), phone:genPhone(s.rollNumber),
      isActive:true,
    };
  });
}

// ── Shared parse + validate logic ─────────────────────────────────────────
function parseWorkbook(buffer, filename) {
  const workbook = XLSX.read(buffer, { type:'buffer' });
  const sheetName = workbook.SheetNames.find(n=>/student/i.test(n)) || workbook.SheetNames[0];
  if (!sheetName) throw new Error('No sheet found in workbook');
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval:'' });
  return { rows, sheetName };
}

// ── POST /api/import/preview ──────────────────────────────────────────────
router.post('/preview', authorize('admin','deo'), upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({ message:'No file uploaded' });

    const { rows, sheetName } = parseWorkbook(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message:'Sheet is empty or has no data rows' });

    const validationResults = rows.map((row,i) => validateRow(row,i));
    const errorRows   = validationResults.filter(r => r.errs.length>0);
    const validRows   = validationResults.filter(r => r.errs.length===0);
    const uniqueRolls = new Set(validRows.map(r=>r.roll)).size;

    const summary = {
      totalRows:rows.length, validRows:validRows.length,
      errorRows:errorRows.length, uniqueStudents:uniqueRolls,
      sheetName, fileName:req.file.originalname,
    };

    res.json({ ok:errorRows.length===0, summary, errors:errorRows, columns:Object.keys(rows[0]||{}) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/import/upload ───────────────────────────────────────────────
router.post('/upload', authorize('admin','deo'), upload.single('file'), async (req,res) => {
  try {
    if (!req.file) return res.status(400).json({ message:'No file uploaded' });

    const { rows, sheetName } = parseWorkbook(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ message:'Sheet is empty or has no data rows' });

    // Scope: DEO can only import their own department
    let filteredRows = rows;
    if (req.user.role==='deo') {
      filteredRows = rows.filter(row => {
        const dept = normDept(get(row,['department']));
        return !dept || dept===req.user.department;
      });
    }

    const validationResults = filteredRows.map((row,i) => validateRow(row,i));
    const errorRows  = validationResults.filter(r=>r.errs.length>0);
    const validRows  = validationResults.filter(r=>r.errs.length===0);

    // Block if >10% of rows have errors
    if (errorRows.length>0 && errorRows.length/filteredRows.length>0.1) {
      return res.status(422).json({
        message:`Too many validation errors (${errorRows.length} rows). Fix errors and re-upload.`,
        errors:errorRows, validRows:validRows.length,
      });
    }

    // Parse only valid rows
    const validRowData = filteredRows.filter((_,i)=>validationResults[i].errs.length===0);
    const students     = parseRows(validRowData);

    // Upsert into DB
    let inserted=0, updated=0;
    for (const student of students) {
      const existing = await Student.findOne({ rollNumber:student.rollNumber });
      await Student.findOneAndUpdate(
        { rollNumber:student.rollNumber },
        { $set:student },
        { upsert:true, runValidators:true }
      );
      existing ? updated++ : inserted++;
    }

    await logAudit({
      req, user:req.user, action:'import.excel_upload', status:'success',
      entityType:'student', message:`Imported ${students.length} students from ${req.file.originalname}`,
      metadata:{ fileName:req.file.originalname, sheetName, inserted, updated,
                 totalRows:rows.length, errorRows:errorRows.length },
    });

    // Bust cached reports since student data changed
    await invalidateCache('/reports');
    await invalidateCache('/ai/predict-risk');
    await invalidateCache('/ai/insights');

    res.json({
      ok:true,
      message:`Import complete: ${inserted} new, ${updated} updated.`,
      stats:{ totalRows:filteredRows.length, validRows:validRows.length,
              errorRows:errorRows.length, inserted, updated, sheetName },
      errors:errorRows,
    });
  } catch (err) {
    res.status(500).json({ message:err.message });
  }
});

module.exports = router;
