function parseYearRange(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  return { start: Number(match[1]), end: Number(match[2]) };
}

// Academic year runs June-May. Returns the start year of the current AY.
function currentAcademicYearStart() {
  const now = new Date();
  return now.getMonth() < 5 ? now.getFullYear() - 1 : now.getFullYear(); // month is 0-indexed
}

function isBatchAcademicYearCompatible(batch, academicYear) {
  if (!batch || !academicYear) return true;

  const batchRange   = parseYearRange(batch);
  const academicRange = parseYearRange(academicYear);

  if (!batchRange || !academicRange) return true;

  // Academic year must be within the batch span
  if (!(academicRange.start >= batchRange.start && academicRange.end <= batchRange.end)) {
    return false;
  }

  // Academic year must not be in the future
  if (academicRange.start > currentAcademicYearStart()) {
    return false;
  }

  return true;
}

function buildImpossibleFilter(existing = {}) {
  return { ...existing, _id: null };
}

module.exports = {
  isBatchAcademicYearCompatible,
  buildImpossibleFilter,
};