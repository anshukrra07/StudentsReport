const router = require('express').Router();
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Get all students with filters
router.get('/', async (req, res) => {
  try {
    const { department, batch, section, semester } = req.query;
    const filter = {};

    // Department-level access control
    if (req.user.role !== 'admin') filter.department = req.user.department;
    else if (department) filter.department = department;

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
