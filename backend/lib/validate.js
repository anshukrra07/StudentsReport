// ─── Lightweight validation helpers (no extra npm deps) ─────────────────────
// Returns { valid: true } or { valid: false, error: 'human readable message' }

const YEAR_RANGE_RE = /^\d{4}-\d{4}$/;
const VALID_SEMESTERS = new Set(['1','2','3','4','5','6','7','8']);
const VALID_REPORT_TYPES = {
  attendance: new Set(['section_wise','subject_wise','department_wise','low_attendance','']),
  marks:      new Set(['internal','external','semester_summary','subject_performance','']),
  backlogs:   new Set(['repeated','pending','']),
  cgpa:       new Set(['ranking','toppers','distribution','']),
  risk:       new Set(['low_cgpa','backlogs','low_attendance','']),
};

function err(message, field) {
  return { valid: false, error: message, field };
}
const ok = { valid: true };

// ─── Individual field validators ─────────────────────────────────────────────

function validateSemester(v) {
  if (!v) return ok;
  if (!VALID_SEMESTERS.has(String(v)))
    return err(`Semester must be 1–8 (got "${v}")`, 'semester');
  return ok;
}

function validateThreshold(v) {
  if (!v) return ok;
  const n = Number(v);
  if (isNaN(n) || n < 0 || n > 100)
    return err(`Threshold must be a number between 0 and 100 (got "${v}")`, 'threshold');
  return ok;
}

function validateLimit(v) {
  if (!v) return ok;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 500)
    return err(`Limit must be a whole number between 1 and 500 (got "${v}")`, 'limit');
  return ok;
}

function validateAcademicYear(v) {
  if (!v) return ok;
  if (!YEAR_RANGE_RE.test(v)) {
    return err(`Academic year must be in format YYYY-YYYY (got "${v}")`, 'academicYear');
  }
  const [start, end] = v.split('-').map(Number);
  if (end !== start + 1)
    return err(`Academic year end must be start + 1 (got "${v}")`, 'academicYear');
  return ok;
}

function validateBatch(v) {
  if (!v) return ok;
  if (!YEAR_RANGE_RE.test(v))
    return err(`Batch must be in format YYYY-YYYY (got "${v}")`, 'batch');
  const [start, end] = v.split('-').map(Number);
  if (end - start < 2 || end - start > 6)
    return err(`Batch year range seems invalid (got "${v}")`, 'batch');
  return ok;
}

function validateReportType(reportType, typeValue) {
  if (!typeValue) return ok;
  const allowed = VALID_REPORT_TYPES[reportType];
  if (!allowed) return ok; // unknown report type, skip
  if (!allowed.has(typeValue))
    return err(
      `Invalid type "${typeValue}" for ${reportType} report. Allowed: ${[...allowed].filter(Boolean).join(', ')}`,
      'type'
    );
  return ok;
}

// ─── Composed validators per route ───────────────────────────────────────────

function validateReportFilters(reportType) {
  return (req, res, next) => {
    const q = req.query;
    const checks = [
      validateSemester(q.semester),
      validateThreshold(q.threshold),
      validateLimit(q.limit),
      validateAcademicYear(q.academicYear),
      validateBatch(q.batch),
      validateReportType(reportType, q.type || q.subtype || q.riskType),
    ];

    for (const result of checks) {
      if (!result.valid) {
        return res.status(400).json({
          error: 'INVALID_FILTER',
          message: result.error,
          field: result.field,
        });
      }
    }

    // Sanitise: strip unknown/dangerous keys — only allow known filter params
    const ALLOWED_KEYS = new Set([
      'type', 'subtype', 'riskType', 'semester', 'academicYear',
      'batch', 'section', 'department', 'threshold', 'limit',
    ]);
    for (const key of Object.keys(q)) {
      if (!ALLOWED_KEYS.has(key)) delete req.query[key];
    }

    next();
  };
}

module.exports = { validateReportFilters };
