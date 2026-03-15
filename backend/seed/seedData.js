require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User     = require('../models/User');
const Student  = require('../models/Student');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/deoreports';

// ── Roll number format: 221FA04001
// Batch 2022-2026 → prefix 22, so: 22 + 1 + FA + 04 + 001 = 221FA04001
// Batch 2021-2025 → 211FA04001
// Batch 2023-2027 → 231FA04001
// Batch 2024-2028 → 241FA04001
const BATCH_YR   = { '2021-2025':'21', '2022-2026':'22', '2023-2027':'23', '2024-2028':'24' };
const DEPT_CODE  = { CSE:'04', ECE:'12', MECH:'02', CIVIL:'01', EEE:'06' };
const DEPT_BR    = { CSE:'FA', ECE:'FB', MECH:'ME', CIVIL:'CE', EEE:'EE' };

function makeRoll(dept, batch, serial) {
  const yr  = BATCH_YR[batch]  || '22';
  const br  = DEPT_BR[dept]    || 'FA';
  const dep = DEPT_CODE[dept]  || '04';
  // Format: 221FA04001  (yr=22, 1, br=FA, dep=04, serial=001)
  return `${yr}1${br}${dep}${String(serial).padStart(3,'0')}`;
}

// ── Real VFSTR CSE subjects (JNTUK R20 scheme) ──────────────────────────
const SUBJECTS = {
  CSE: {
    1:[
      {code:'20A54101',name:'Linear Algebra & Calculus'},
      {code:'20A52101',name:'Engineering Physics'},
      {code:'20A51101',name:'Engineering Chemistry'},
      {code:'20A53101',name:'English for Communication'},
      {code:'20A05101',name:'Problem Solving using C'},
      {code:'20A05102',name:'IT Workshop'},
    ],
    2:[
      {code:'20A54201',name:'Differential Equations & Transform Techniques'},
      {code:'20A05201',name:'Data Structures'},
      {code:'20A05202',name:'Digital Logic Design'},
      {code:'20A05203',name:'Object Oriented Programming using Java'},
      {code:'20A52201',name:'Engineering Physics Lab'},
      {code:'20A05204',name:'Data Structures Lab'},
    ],
    3:[
      {code:'20A54301',name:'Probability & Statistics'},
      {code:'20A05301',name:'Design & Analysis of Algorithms'},
      {code:'20A05302',name:'Computer Organization & Architecture'},
      {code:'20A05303',name:'Database Management Systems'},
      {code:'20A05304',name:'Operating Systems'},
      {code:'20A05305',name:'DBMS Lab'},
    ],
    4:[
      {code:'20A05401',name:'Formal Languages & Automata Theory'},
      {code:'20A05402',name:'Computer Networks'},
      {code:'20A05403',name:'Software Engineering'},
      {code:'20A05404',name:'Microprocessors & Interfacing'},
      {code:'20A05405',name:'Web Technologies'},
      {code:'20A05406',name:'Computer Networks Lab'},
    ],
    5:[
      {code:'20A05501',name:'Compiler Design'},
      {code:'20A05502',name:'Data Warehousing & Mining'},
      {code:'20A05503',name:'Machine Learning'},
      {code:'20A05504',name:'Cloud Computing'},
      {code:'20A05505',name:'Machine Learning Lab'},
      {code:'20A05506',name:'Full Stack Development Lab'},
    ],
    6:[
      {code:'20A05601',name:'Artificial Intelligence'},
      {code:'20A05602',name:'Big Data Analytics'},
      {code:'20A05603',name:'Information Security'},
      {code:'20A05604',name:'Internet of Things'},
      {code:'20A05605',name:'AI & ML Lab'},
      {code:'20A05606',name:'Project Phase-I'},
    ],
    7:[
      {code:'20A05701',name:'Deep Learning'},
      {code:'20A05702',name:'Distributed Systems'},
      {code:'20A05703',name:'Natural Language Processing'},
      {code:'20A05704',name:'Block Chain Technology'},
      {code:'20A05705',name:'Project Phase-II'},
    ],
    8:[
      {code:'20A05801',name:'Data Science & Analytics'},
      {code:'20A05802',name:'Edge Computing'},
      {code:'20A05803',name:'Internship / Industry Project'},
      {code:'20A05804',name:'Major Project'},
    ],
  },
  ECE:{
    1:[
      {code:'20A54101',name:'Linear Algebra & Calculus'},
      {code:'20A52101',name:'Engineering Physics'},
      {code:'20A51101',name:'Engineering Chemistry'},
      {code:'20A53101',name:'English for Communication'},
      {code:'20A12101',name:'Basic Electrical & Electronics Engg'},
      {code:'20A12102',name:'Electronics Workshop'},
    ],
    2:[
      {code:'20A54201',name:'Differential Equations & Transform Techniques'},
      {code:'20A12201',name:'Electronic Devices & Circuits'},
      {code:'20A12202',name:'Circuit Theory'},
      {code:'20A12203',name:'Signals & Systems'},
      {code:'20A12204',name:'C Programming Lab'},
      {code:'20A12205',name:'Electronic Devices Lab'},
    ],
    3:[
      {code:'20A54301',name:'Probability & Statistics'},
      {code:'20A12301',name:'Analog Electronic Circuits'},
      {code:'20A12302',name:'Digital Electronics'},
      {code:'20A12303',name:'Electromagnetic Theory'},
      {code:'20A12304',name:'Analog Circuits Lab'},
      {code:'20A12305',name:'Digital Electronics Lab'},
    ],
    4:[
      {code:'20A12401',name:'Linear IC Applications'},
      {code:'20A12402',name:'Communication Systems'},
      {code:'20A12403',name:'Microprocessors & Microcontrollers'},
      {code:'20A12404',name:'Control Systems'},
      {code:'20A12405',name:'IC Applications Lab'},
      {code:'20A12406',name:'Communication Systems Lab'},
    ],
  },
  MECH:{
    1:[
      {code:'20A54101',name:'Linear Algebra & Calculus'},
      {code:'20A52101',name:'Engineering Physics'},
      {code:'20A51101',name:'Engineering Chemistry'},
      {code:'20A53101',name:'English for Communication'},
      {code:'20A02101',name:'Engineering Drawing'},
      {code:'20A02102',name:'Workshop Practice'},
    ],
    2:[
      {code:'20A54201',name:'Differential Equations & Transform Techniques'},
      {code:'20A02201',name:'Engineering Mechanics'},
      {code:'20A02202',name:'Thermodynamics'},
      {code:'20A02203',name:'Material Science'},
      {code:'20A02204',name:'Machine Drawing Lab'},
      {code:'20A02205',name:'Material Testing Lab'},
    ],
  },
  CIVIL:{
    1:[
      {code:'20A54101',name:'Linear Algebra & Calculus'},
      {code:'20A52101',name:'Engineering Physics'},
      {code:'20A51101',name:'Engineering Chemistry'},
      {code:'20A53101',name:'English for Communication'},
      {code:'20A01101',name:'Engineering Drawing'},
      {code:'20A01102',name:'Civil Engineering Workshop'},
    ],
    2:[
      {code:'20A54201',name:'Differential Equations & Transform Techniques'},
      {code:'20A01201',name:'Mechanics of Solids'},
      {code:'20A01202',name:'Fluid Mechanics'},
      {code:'20A01203',name:'Surveying'},
      {code:'20A01204',name:'Surveying Lab'},
      {code:'20A01205',name:'Fluid Mechanics Lab'},
    ],
  },
  EEE:{
    1:[
      {code:'20A54101',name:'Linear Algebra & Calculus'},
      {code:'20A52101',name:'Engineering Physics'},
      {code:'20A51101',name:'Engineering Chemistry'},
      {code:'20A53101',name:'English for Communication'},
      {code:'20A06101',name:'Basic Electrical Engineering'},
      {code:'20A06102',name:'Electrical Workshop'},
    ],
    2:[
      {code:'20A54201',name:'Differential Equations & Transform Techniques'},
      {code:'20A06201',name:'Circuit Theory'},
      {code:'20A06202',name:'Electrical Machines-I'},
      {code:'20A06203',name:'Electronic Devices & Circuits'},
      {code:'20A06204',name:'Electrical Machines Lab'},
      {code:'20A06205',name:'Basic Electronics Lab'},
    ],
  },
};

function getSubs(dept, sem) {
  return SUBJECTS[dept]?.[sem] || SUBJECTS['CSE']?.[sem] || SUBJECTS['CSE'][1];
}

const rand      = (a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const randF     = (a,b)=>parseFloat((Math.random()*(b-a)+a).toFixed(1));

function semYear(batch, semNum) {
  const y = parseInt(batch.split('-')[0]) + Math.floor((semNum-1)/2);
  return `${y}-${y+1}`;
}

function makeSem(semNum, dept, batch, good) {
  const subs = getSubs(dept, semNum);
  const subjects = subs.map(s => {
    const internal = good ? rand(22,30) : rand(8,28);
    const external = good ? rand(48,70) : rand(15,62);
    const total    = internal + external;
    return { subjectCode:s.code, subjectName:s.name, internal, external, total, maxInternal:30, maxExternal:70, status:total>=35?'pass':'fail' };
  });
  const passed = subjects.filter(s=>s.status==='pass').length;
  const avg    = subjects.reduce((a,s)=>a+(s.total/100),0)/subjects.length;
  return {
    semNumber:semNum,
    academicYear:semYear(batch,semNum),
    subjects,
    sgpa:parseFloat(Math.min(10,avg*10).toFixed(2)),
    totalCredits:subs.length*4,
    earnedCredits:passed*4,
    result:passed===subs.length?'pass':'fail',
  };
}

function makeAtt(dept, semNum, batch, good) {
  return getSubs(dept, semNum).map(s => {
    const total    = rand(60,92);
    const pct      = good ? randF(72,98) : randF(40,88);
    const attended = Math.floor(total*pct/100);
    return { subjectCode:s.code, subjectName:s.name, semester:semNum, totalClasses:total, attendedClasses:attended, percentage:parseFloat(pct.toFixed(1)), academicYear:semYear(batch,semNum) };
  });
}

const NAMES = [
  'Venkata Ramana','Sai Krishna','Lakshmi Priya','Ravi Teja','Naga Sravani',
  'Pavan Kumar','Divya Sri','Mahesh Babu','Anitha Reddy','Kiran Kumar',
  'Sneha Goud','Aakash Rao','Mounika Devi','Srikanth Varma','Bhavani Nair',
  'Hemanth Chowdary','Padmaja Rani','Suresh Babu','Kavitha Latha','Rajesh Naidu',
  'Vamsi Krishna','Sruthi Merugu','Chaitanya Prasad','Pooja Bollam','Nikhil Reddy',
  'Manasa Tadikonda','Siddharth Goud','Usha Rani','Prudhvi Raj','Swapna Lakshmi',
  'Tarun Tej','Soumya Nanduri','Abhishek Varma','Revathi Akula','Rohith Kona',
  'Yamini Devi','Pranay Kumar','Nandini Reddy','Gowtham Raju','Sindhu Priya',
];

function makeStudent(serial, dept, batch, section) {
  const good    = Math.random() > 0.3;
  const startYr = parseInt(batch.split('-')[0]);
  const maxSems = Math.min(8, Math.max(1,(2024-startYr)*2));
  const numSems = rand(1, maxSems);

  const semesters  = Array.from({length:numSems},(_,i)=>makeSem(i+1,dept,batch,good));
  const cgpa       = semesters.length
    ? parseFloat((semesters.reduce((s,sm)=>s+sm.sgpa,0)/semesters.length).toFixed(2)) : 0;
  const attendance = semesters.flatMap((_,i)=>makeAtt(dept,i+1,batch,good));
  const backlogs   = [...new Set(semesters.flatMap(sm=>sm.subjects.filter(s=>s.status==='fail').map(s=>s.subjectCode)))];
  const roll       = makeRoll(dept, batch, serial);

  return {
    rollNumber:roll, name:NAMES[(serial-1)%NAMES.length], department:dept, section, batch,
    currentSemester:numSems, cgpa, semesters, attendance, backlogs,
    email:`${roll.toLowerCase()}@vfstr.ac.in`, phone:`9${rand(100000000,999999999)}`, isActive:true,
  };
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('✅ MongoDB connected');
  await User.deleteMany({});
  await Student.deleteMany({});
  console.log('🗑  Cleared old data');

  const users = [
    {username:'admin',      password:'admin123',  name:'System Administrator',       role:'admin',   department:'Admin', email:'admin@vfstr.ac.in'},
    {username:'deo_cse',    password:'deo123',    name:'K. Rajesh Kumar',            role:'deo',     department:'CSE',   email:'deo.cse@vfstr.ac.in'},
    {username:'deo_ece',    password:'deo123',    name:'G. Sunita Sharma',           role:'deo',     department:'ECE',   email:'deo.ece@vfstr.ac.in'},
    {username:'deo_mech',   password:'deo123',    name:'P. Ramakrishna',             role:'deo',     department:'MECH',  email:'deo.mech@vfstr.ac.in'},
    {username:'hod_cse',    password:'hod123',    name:'Prof. P. Venkata Rao',       role:'hod',     department:'CSE',   email:'hod.cse@vfstr.ac.in'},
    {username:'faculty_cse',password:'faculty123',name:'Dr. B. Priya Nair',         role:'faculty', department:'CSE',   email:'faculty.cse@vfstr.ac.in'},
  ];
  for(const u of users){ const d=new User(u); await d.save(); }
  console.log(`✅ ${users.length} users seeded`);

  let total=0;
  for(const dept of ['CSE','ECE','MECH','CIVIL','EEE']){
    for(const batch of ['2021-2025','2022-2026','2023-2027','2024-2028']){
      let serial=1;
      for(const sec of ['A','B','C']){
        const count=rand(18,28);
        const docs=Array.from({length:count},(_,i)=>makeStudent(serial+i,dept,batch,sec));
        await Student.insertMany(docs);
        serial+=count; total+=count;
      }
    }
  }
  console.log(`✅ ${total} students seeded`);
  console.log('\nSample roll numbers:');
  console.log('  CSE 2021-2025 Section A: 211FA04001, 211FA04002...');
  console.log('  CSE 2022-2026 Section A: 221FA04001, 221FA04002...');
  console.log('  CSE 2023-2027 Section A: 231FA04001, 231FA04002...');
  console.log('\nLogin: admin/admin123  |  deo_cse/deo123  |  hod_cse/hod123');
  await mongoose.disconnect();
  process.exit(0);
}
seed().catch(e=>{ console.error(e); process.exit(1); });
