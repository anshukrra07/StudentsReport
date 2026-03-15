const mongoose = require('mongoose');

const subjectMarkSchema = new mongoose.Schema({
  subjectCode: String,
  subjectName: String,
  internal: Number,
  external: Number,
  total: Number,
  maxInternal: { type: Number, default: 30 },
  maxExternal: { type: Number, default: 70 },
  status: { type: String, enum: ['pass', 'fail', 'absent'], default: 'pass' }
});

const semesterSchema = new mongoose.Schema({
  semNumber: Number,
  academicYear: String,
  subjects: [subjectMarkSchema],
  sgpa: Number,
  totalCredits: Number,
  earnedCredits: Number,
  result: { type: String, enum: ['pass', 'fail', 'detained'], default: 'pass' }
});

const attendanceSchema = new mongoose.Schema({
  subjectCode: String,
  subjectName: String,
  semester: Number,
  totalClasses: Number,
  attendedClasses: Number,
  percentage: Number,
  academicYear: String
});

const studentSchema = new mongoose.Schema({
  rollNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  department: { type: String, required: true },
  section: { type: String },
  batch: { type: String, required: true }, // e.g., "2021-2025"
  currentSemester: { type: Number },
  cgpa: { type: Number, default: 0 },
  semesters: [semesterSchema],
  attendance: [attendanceSchema],
  backlogs: [{ type: String }], // subject codes with backlog
  email: String,
  phone: String,
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema);
