/**
 * aiRoutes.js  — AI-powered academic intelligence (using Google Gemini)
 *
 * POST /api/ai/query        — Natural language → structured report query via Gemini
 * GET  /api/ai/predict-risk — Risk probability score per student
 * GET  /api/ai/insights     — AI narrative analysis of department data
 *
 * Add to backend/.env:
 *   GEMINI_API_KEY=AIza...
 */

const router  = require('express').Router();
const axios   = require('axios');
const Student = require('../models/Student');
const { authenticate } = require('../middleware/auth');
const { isBatchAcademicYearCompatible, buildImpossibleFilter } = require('../lib/filterCompatibility');

router.use(authenticate);

function buildFilter(user, q = {}) {
  const f = {};
  if (user.role !== 'admin') f.department = user.department;
  else if (q.department)     f.department = q.department;
  if (q.batch)   f.batch   = q.batch;
  if (q.section) f.section = q.section;
  if (!isBatchAcademicYearCompatible(q.batch, q.academicYear)) {
    return buildImpossibleFilter(f);
  }
  return f;
}

function matchesSemAndYear(recordSemester, recordAcademicYear, semester, academicYear) {
  const semOk = !semester || recordSemester === parseInt(semester, 10);
  const yrOk = !academicYear || recordAcademicYear === academicYear;
  return semOk && yrOk;
}

function hasScopedFilter(query = {}) {
  return !!(query.semester || query.academicYear);
}

function getScopedSemesters(student, query = {}) {
  const { semester, academicYear } = query;
  return (student.semesters || []).filter(sm =>
    matchesSemAndYear(sm.semNumber, sm.academicYear, semester, academicYear)
  );
}

function getScopedAttendance(student, query = {}) {
  const { semester, academicYear } = query;
  return (student.attendance || []).filter(a =>
    matchesSemAndYear(a.semester, a.academicYear, semester, academicYear)
  );
}

function getScopedCgpa(student, query = {}) {
  const semesters = getScopedSemesters(student, query);
  if (!hasScopedFilter(query)) return student.cgpa || 0;
  if (!semesters.length) return 0;
  return parseFloat((semesters.reduce((sum, sm) => sum + (sm.sgpa || 0), 0) / semesters.length).toFixed(2));
}

function getScopedBacklogCount(student, query = {}) {
  if (!hasScopedFilter(query)) return (student.backlogs || []).length;

  const scopedSemesters = getScopedSemesters(student, query);
  const failedCodes = new Set(
    scopedSemesters.flatMap(sm =>
      (sm.subjects || []).filter(sub => sub.status === 'fail').map(sub => sub.subjectCode)
    )
  );

  if (failedCodes.size) return failedCodes.size;

  // Import fallback: one workbook row per student stores backlog count only at student level.
  if (scopedSemesters.length === 1 && (student.semesters || []).length === 1) {
    return (student.backlogs || []).length;
  }

  return 0;
}

function getScopedTrend(student, query = {}) {
  const semesters = getScopedSemesters(student, query)
    .slice()
    .sort((a, b) => a.semNumber - b.semNumber);

  if (semesters.length < 2) return null;

  return parseFloat((semesters[semesters.length - 1].sgpa - semesters[semesters.length - 2].sgpa).toFixed(2));
}

function getRiskFactors({ cgpa, avgAtt, backlogCount, cgpaTrend, dangerSubjects }) {
  const factors = [];

  if (cgpa < 5.0) factors.push(`Critical CGPA (${cgpa}, +40)`);
  else if (cgpa < 6.0) factors.push(`Low CGPA (${cgpa}, +28)`);
  else if (cgpa < 7.0) factors.push(`Below-target CGPA (${cgpa}, +14)`);
  else if (cgpa < 8.0) factors.push(`Moderate CGPA watch (${cgpa}, +4)`);

  if (avgAtt < 60) factors.push(`Critical attendance ${avgAtt}% (+25)`);
  else if (avgAtt < 65) factors.push(`Low attendance ${avgAtt}% (+18)`);
  else if (avgAtt < 75) factors.push(`Attendance below 75% (${avgAtt}%, +10)`);
  else if (avgAtt < 85) factors.push(`Attendance watch ${avgAtt}% (+3)`);

  if (backlogCount >= 5) factors.push(`${backlogCount} active backlogs (+20)`);
  else if (backlogCount >= 3) factors.push(`${backlogCount} active backlogs (+14)`);
  else if (backlogCount >= 1) factors.push(`${backlogCount} active backlog(s) (+7)`);

  if (cgpaTrend !== null) {
    if (cgpaTrend < -1.5) factors.push(`Sharp CGPA decline (${cgpaTrend}, +10)`);
    else if (cgpaTrend < -0.5) factors.push(`CGPA declining (${cgpaTrend}, +6)`);
    else if (cgpaTrend < 0) factors.push(`Slight CGPA decline (${cgpaTrend}, +2)`);
  }

  if (dangerSubjects >= 3) factors.push(`${dangerSubjects} subject(s) below 40 marks (+5)`);
  else if (dangerSubjects >= 1) factors.push(`${dangerSubjects} subject(s) below 40 marks (+2)`);

  return factors;
}

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8,
};

function normalizeDepartment(value) {
  if (!value) return null;
  const text = String(value).trim().toLowerCase();
  if (['cse', 'computer science', 'computer science engineering'].includes(text)) return 'CSE';
  if (['ece', 'electronics', 'electronics and communication'].includes(text)) return 'ECE';
  if (['eee', 'electrical', 'electrical and electronics'].includes(text)) return 'EEE';
  if (['mech', 'mechanical', 'mechanical engineering'].includes(text)) return 'MECH';
  if (['civil', 'civil engineering'].includes(text)) return 'CIVIL';
  return String(value).trim().toUpperCase();
}

function normalizeSection(value) {
  if (!value) return null;
  const match = String(value).trim().match(/[ABC]/i);
  return match ? match[0].toUpperCase() : null;
}

function normalizeSemester(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim().toLowerCase();
  const direct = text.match(/\b([1-8])\b/);
  if (direct) return direct[1];
  if (WORD_NUMBERS[text]) return String(WORD_NUMBERS[text]);
  return null;
}

function normalizeYearRange(value) {
  if (!value) return null;
  const text = String(value).trim().replace(/[–/]/g, '-');
  const full = text.match(/\b(20\d{2})-(20\d{2})\b/);
  if (full) return `${full[1]}-${full[2]}`;
  const short = text.match(/\b(20\d{2})-(\d{2})\b/);
  if (short) return `${short[1]}-20${short[2]}`;
  return null;
}

function normalizePositiveInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseInt(String(value).trim(), 10);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function inferReportFallback(message) {
  const lower = String(message || '').toLowerCase();
  if (/(attendance|shortage|detain|absent)/i.test(lower)) return 'attendance';
  if (/(internal|external|marks|result|score|grade)/i.test(lower)) return 'marks';
  if (/(backlog|arrear|pending credits|repeated subject)/i.test(lower)) return 'backlogs';
  if (/(at risk|risk|struggling|weak students)/i.test(lower)) return 'risk';
  if (/(topper|top performer|best student)/i.test(lower)) return 'toppers';
  return 'cgpa';
}

function normalizeParsedQuery(parsed = {}, message = '') {
  const report = ['attendance', 'marks', 'backlogs', 'cgpa', 'risk', 'toppers'].includes(parsed.report)
    ? parsed.report
    : inferReportFallback(message);

  const normalized = {
    report,
    department: normalizeDepartment(parsed.department),
    batch: normalizeYearRange(parsed.batch),
    section: normalizeSection(parsed.section),
    semester: normalizeSemester(parsed.semester),
    academicYear: normalizeYearRange(parsed.academicYear),
    type: parsed.type || null,
    threshold: normalizePositiveInteger(parsed.threshold),
    limit: normalizePositiveInteger(parsed.limit),
    intent: parsed.intent || '',
  };

  const lower = String(message || '').toLowerCase();

  if (report === 'attendance' && !normalized.type) {
    if (/(low|shortage|below|under|detain)/i.test(lower)) normalized.type = 'low_attendance';
    else if (/(subject|course)/i.test(lower)) normalized.type = 'subject_wise';
    else if (/(department|dept|compare)/i.test(lower)) normalized.type = 'department_wise';
    else normalized.type = 'section_wise';
  }

  if (report === 'marks' && !normalized.type) {
    if (/(internal|mid)/i.test(lower)) normalized.type = 'internal';
    else if (/(semester result|result summary|pass percentage|fail percentage)/i.test(lower)) normalized.type = 'semester_summary';
    else if (/(subject performance|subject analysis)/i.test(lower)) normalized.type = 'subject_performance';
    else normalized.type = 'external';
  }

  if (report === 'cgpa' && !normalized.type) {
    if (/(distribution|range)/i.test(lower)) normalized.type = 'distribution';
    else if (/(topper|top performers?|best)/i.test(lower)) normalized.type = 'toppers';
    else normalized.type = 'ranking';
  }

  if (report === 'risk' && !normalized.type) {
    if (/(low cgpa)/i.test(lower)) normalized.type = 'low_cgpa';
    else if (/(backlog)/i.test(lower)) normalized.type = 'backlogs';
    else if (/(attendance)/i.test(lower)) normalized.type = 'low_attendance';
  }

  if (report === 'backlogs' && !normalized.type) {
    if (/(repeated|repeat)/i.test(lower)) normalized.type = 'repeated';
    else if (/(pending)/i.test(lower)) normalized.type = 'pending';
  }

  if (report === 'attendance' && !normalized.threshold && /(low attendance|shortage|detain)/i.test(lower)) {
    normalized.threshold = 75;
  }

  return normalized;
}

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash-lite',    // GA — fastest/cheapest
  'gemini-2.5-flash',

].filter(Boolean);

function extractText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map(part => part?.text || '')
    .join('')
    .trim();
}

// ── Gemini API call — supports single-turn and multi-turn ────────────────
async function callAI(systemPrompt, userMsg, conversationHistory = [], maxTokens = 900) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in .env');

  let lastError = null;

  // Build contents array: history turns + current user message
  const contents = [
    ...conversationHistory.map(turn => ({
      role: turn.role,          // 'user' | 'model'
      parts: [{ text: turn.text }],
    })),
    { role: 'user', parts: [{ text: userMsg }] },
  ];

  for (const model of GEMINI_MODELS) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: maxTokens,
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': key,
          },
          timeout: 15000,
        }
      );

      const text = extractText(res.data);
      if (!text) throw new Error(`Empty response from Gemini model ${model}`);
      return text;
    } catch (err) {
      lastError = err;
      const status = err?.response?.status;
      if (status && ![404, 429, 500, 503].includes(status)) break;
    }
  }

  if (lastError?.response?.status) {
    throw new Error(`Gemini request failed with status ${lastError.response.status}`);
  }
  throw lastError || new Error('Gemini request failed');
}

// ── 1. NATURAL LANGUAGE → STRUCTURED QUERY ───────────────────────────────
router.post('/query', async (req, res) => {
  try {
    let { message, conversationHistory } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'message required' });

    // ── Conversational fallback mode ──────────────────────────────────────
    // Frontend sends __CONVERSE__: prefix when the first AI attempt failed
    // In this mode we use a looser prompt that tries its best to map to a report
    // but is allowed to return report: null for truly unrelated messages
    const isConverse = message.startsWith('__CONVERSE__:');
    if (isConverse) message = message.replace('__CONVERSE__:', '').trim();

    // Single flexible prompt — no separate converse mode needed
    // Gemini is smart enough to handle both clear and vague queries in any language
    const system = `You are an expert academic data assistant for VFSTR university (Vignan's Foundation for Science Technology & Research, Guntur, Andhra Pradesh, India).

You understand English, Hindi, Hinglish, Telugu, and any mix. Your ONLY job is to map ANY user query to the most relevant academic report. You must ALWAYS return a valid report — never null.

═══════════════════════════════════════════════
REPORT TYPES — WHEN TO USE EACH
═══════════════════════════════════════════════

1. TOPPERS (best students by CGPA)
   Use when user mentions:
   good, best, top, excellent, brilliant, smart, intelligent, talented, skilled, capable,
   high performer, rank 1, topper, meritorious, outstanding, achiever, star student,
   good in coding, good in studies, good in maths, good in anything academic,
   sabse acha, sabse hoshiyar, best students, who is good, who is doing well,
   highest CGPA, highest marks, who scored most, gold medalist type,
   kaun acha hai, best wale, performers

2. RISK (struggling students)
   Use when user mentions:
   struggling, weak, poor, bad, failing, at-risk, danger, in trouble, need help,
   low performance, not doing well, behind, lagging, below average,
   intervention needed, counseling needed, who needs help, who is failing,
   kamzor, pareshan, mushkil mein, fail hone wale, pichde hue,
   concern, worry, alarming, critical students, drop out risk,
   who should I focus on, who needs attention, problematic students

3. BACKLOGS (students with failed subjects)
   Use when user mentions:
   backlog, arrear, fail, failed, pending exam, KT, detained, repeat,
   subject fail, not cleared, due exam, carry forward, supplementary,
   backlog wale, fail hue, arrear students, jinke subjects pending hain,
   who failed which subject, failed in semester, detained students,
   pending credits, incomplete degree, repeated subjects

4. ATTENDANCE (presence/absence data)
   Use when user mentions:
   attendance, present, absent, bunking, proxy, missing class, not coming,
   haziri, haziri kam, absent students, low presence, irregular,
   who is not attending, attendance shortage, below 75, detain risk,
   section attendance, subject attendance, department attendance,
   kaun nahi aata, kaun absent rehta, kam haziri wale,
   attendance problem, who will be detained, attendance criteria

5. MARKS (exam performance)
   Use when user mentions:
   marks, score, result, grade, exam, internal, external, mid exam,
   semester result, subject performance, how did they perform,
   kitne number, kitne marks, result kya aaya, kaisa result,
   pass percentage, fail percentage, subject wise marks,
   internal marks, external marks, theory marks, practical marks,
   semester summary, subject analysis, who scored how much

6. CGPA (overall academic standing / full student list)
   Use when user mentions:
   CGPA, grade point, GPA, overall performance, academic standing,
   ranking, rank list, all students, complete list, full list,
   sabhi students, poori list, everyone, all records,
   CGPA distribution, how is the department doing overall,
   semester wise CGPA, batch performance, department CGPA,
   who has what CGPA, academic overview, performance summary,
   list of students, student list, show everyone

═══════════════════════════════════════════════
SUB-TYPES
═══════════════════════════════════════════════

attendance sub-types:
  section_wise    → default, per student attendance
  subject_wise    → attendance per subject
  department_wise → compare departments
  low_attendance  → only students below threshold

marks sub-types:
  external            → default, end semester marks
  internal            → mid-term / internal assessment
  semester_summary    → pass/fail counts per semester
  subject_performance → subject-wise pass/fail analysis

cgpa sub-types:
  ranking      → default, all students ranked by CGPA
  toppers      → only top N students
  distribution → CGPA range buckets (9-10, 8-9, etc.)

risk sub-types:
  (empty)         → all risk factors combined
  low_cgpa        → only low CGPA students
  backlogs        → only students with multiple backlogs
  low_attendance  → only attendance risk

═══════════════════════════════════════════════
FILTER EXTRACTION
═══════════════════════════════════════════════

Extract ONLY if clearly mentioned — never guess:
- department: CSE | ECE | MECH | CIVIL | EEE
- section: A | B | C
- semester: 1 to 8 (also extract from "third semester", "sem 3", "3rd sem")
- batch: 2021-2025 | 2022-2026 | 2023-2027 | 2024-2028
- academicYear: format "2023-2024"
- threshold: attendance % (default 75 if "low attendance" mentioned without number)
- limit: number of students (extract from "top 5", "best 10", "top ten")

═══════════════════════════════════════════════
DECISION LOGIC FOR AMBIGUOUS QUERIES
═══════════════════════════════════════════════

- "students ki list" / "show all" / "give me data" → cgpa ranking
- "good in X" where X is any skill/subject → toppers
- "who should I worry about" → risk
- "how is department doing" → cgpa distribution
- "compare sections" → attendance department_wise or cgpa ranking
- "semester 3 students" → marks external for sem 3
- "give me report" (no type) → cgpa ranking (default comprehensive)
- any query about a specific student name/roll → cgpa ranking with their name visible
- "internship eligible" → cgpa ranking (CGPA cutoff proxy)
- "placement eligible" → toppers (high CGPA)
- "scholarship" → toppers
- "detain" / "will be detained" → attendance low_attendance
- filter-only follow-ups like "section B", "only sem 7", "same for ECE" should preserve the previous report context if provided in the message

═══════════════════════════════════════════════
ABSOLUTE RULES
═══════════════════════════════════════════════

1. NEVER return report: null — always pick the best match
2. When completely unsure → cgpa ranking (most useful default)
3. intent MUST be in English always
4. Return ONLY raw JSON — no markdown, no explanation, no extra text
5. Do not add filters that weren't mentioned by the user

JSON structure (return exactly this):
{"report":"<type>","department":null,"batch":null,"section":null,"semester":null,"academicYear":null,"type":null,"threshold":null,"limit":null,"intent":"<clear English sentence of what user wants>"}`;

    const raw    = await callAI(system, message, Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : []);
    const clean  = raw.replace(/```json|```/g, '').trim();
    const parsed = normalizeParsedQuery(JSON.parse(clean), message);

    const qp = new URLSearchParams();
    if (parsed.department)   qp.append('department',   parsed.department);
    if (parsed.batch)        qp.append('batch',        parsed.batch);
    if (parsed.section)      qp.append('section',      parsed.section);
    if (parsed.semester)     qp.append('semester',     parsed.semester);
    if (parsed.academicYear) qp.append('academicYear', parsed.academicYear);
    if (parsed.threshold)    qp.append('threshold',    parsed.threshold);

    const epMap = {
      attendance: `/reports/attendance?type=${parsed.type || 'section_wise'}&${qp}`,
      marks:      `/reports/marks?type=${parsed.type || 'external'}&${qp}`,
      backlogs:   `/reports/backlogs?subtype=${parsed.type || ''}&${qp}`,
      cgpa:       `/reports/cgpa?type=${parsed.type || 'ranking'}&${qp}`,
      risk:       `/reports/risk?riskType=${parsed.type || ''}&${qp}`,
      toppers:    `/reports/top-performers?limit=${parsed.limit || 10}&${qp}`,
    };

    res.json({ parsed, endpoint: epMap[parsed.report] || null, intent: parsed.intent });
  } catch (err) {
    res.status(500).json({ message: 'AI query failed: ' + err.message });
  }
});

// ── 2. RISK PREDICTION ───────────────────────────────────────────────────
router.get('/predict-risk', async (req, res) => {
  try {
    const students = await Student.find(buildFilter(req.user, req.query));

    const predictions = students.map(s => {
      const scopedSemesters = getScopedSemesters(s, req.query);
      const scopedAttendance = getScopedAttendance(s, req.query);
      if (hasScopedFilter(req.query) && !scopedSemesters.length && !scopedAttendance.length) return null;

      const cgpa = getScopedCgpa(s, req.query);
      const attPcts = scopedAttendance.map(a => a.percentage);
      const avgAtt = attPcts.length
        ? parseFloat((attPcts.reduce((a, b) => a + b, 0) / attPcts.length).toFixed(1))
        : 100;

      const cgpaTrend = getScopedTrend(s, req.query);
      const dangerSubjects = scopedSemesters.flatMap(sm =>
        (sm.subjects || []).filter(sub => (sub.total || 0) < 40)
      ).length;
      const backlogCount = getScopedBacklogCount(s, req.query);

      let score = 0;
      // CGPA: 40 pts
      if (cgpa < 5.0)      score += 40;
      else if (cgpa < 6.0) score += 28;
      else if (cgpa < 7.0) score += 14;
      else if (cgpa < 8.0) score += 4;
      // Attendance: 25 pts
      if (avgAtt < 60)      score += 25;
      else if (avgAtt < 65) score += 18;
      else if (avgAtt < 75) score += 10;
      else if (avgAtt < 85) score += 3;
      // Backlogs: 20 pts
      if (backlogCount >= 5)      score += 20;
      else if (backlogCount >= 3) score += 14;
      else if (backlogCount >= 1) score += 7;
      // Trend: 10 pts
      if (cgpaTrend !== null) {
        if (cgpaTrend < -1.5)      score += 10;
        else if (cgpaTrend < -0.5) score += 6;
        else if (cgpaTrend < 0)    score += 2;
      }
      // Danger subs: 5 pts
      if (dangerSubjects >= 3)      score += 5;
      else if (dangerSubjects >= 1) score += 2;

      const riskProbability = Math.min(100, score);
      const riskLevel = riskProbability >= 70 ? 'HIGH' : riskProbability >= 35 ? 'MEDIUM' : 'LOW';
      const riskFactors = getRiskFactors({ cgpa, avgAtt, backlogCount, cgpaTrend, dangerSubjects });

      return {
        rollNumber: s.rollNumber, name: s.name,
        department: s.department, section: s.section, batch: s.batch,
        cgpa, avgAttendance: avgAtt, backlogCount, cgpaTrend, dangerSubjects,
        riskProbability, riskLevel, riskFactors,
      };
    }).filter(Boolean);

    predictions.sort((a, b) => b.riskProbability - a.riskProbability);

    const summary = {
      total:        predictions.length,
      high:         predictions.filter(p => p.riskLevel === 'HIGH').length,
      medium:       predictions.filter(p => p.riskLevel === 'MEDIUM').length,
      low:          predictions.filter(p => p.riskLevel === 'LOW').length,
      avgRiskScore: predictions.length
        ? parseFloat((predictions.reduce((s, p) => s + p.riskProbability, 0) / predictions.length).toFixed(1))
        : 0,
    };

    res.json({ summary, data: predictions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 3. SMART INSIGHTS ────────────────────────────────────────────────────
router.get('/insights', async (req, res) => {
  try {
    const filter   = buildFilter(req.user, req.query);
    let students = await Student.find(filter);
    if (hasScopedFilter(req.query)) {
      students = students.filter(s => getScopedSemesters(s, req.query).length || getScopedAttendance(s, req.query).length);
    }

    if (!students.length)
      return res.json({ narrative: 'No data found for selected filters.', insights: [], recommendations: [] });

    const total    = students.length;
    const avgCgpa  = parseFloat((students.reduce((s, x) => s + getScopedCgpa(x, req.query), 0) / total).toFixed(2));
    const withBack = students.filter(s => getScopedBacklogCount(s, req.query) > 0).length;
    const lowAtt   = students.filter(s => getScopedAttendance(s, req.query).some(a => a.percentage < 75)).length;
    const atRisk   = students.filter(s => {
      const score = getScopedCgpa(s, req.query);
      const backlogs = getScopedBacklogCount(s, req.query);
      return score < 6.0 || backlogs >= 2 || getScopedAttendance(s, req.query).some(a => a.percentage < 65);
    }).length;
    const toppers  = students.filter(s => getScopedCgpa(s, req.query) >= 9.0).length;
    const passRate = parseFloat((((students.filter(s => getScopedBacklogCount(s, req.query) === 0).length) / total) * 100).toFixed(1));

    const dist = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, 'below 6': 0 };
    students.forEach(s => {
      const score = getScopedCgpa(s, req.query);
      if (score >= 9)      dist['9-10']++;
      else if (score >= 8) dist['8-9']++;
      else if (score >= 7) dist['7-8']++;
      else if (score >= 6) dist['6-7']++;
      else                 dist['below 6']++;
    });

    const semMap = {};
    students.forEach(s =>
      getScopedSemesters(s, req.query).forEach(sm => {
        if (!semMap[sm.semNumber]) semMap[sm.semNumber] = [];
        semMap[sm.semNumber].push(sm.sgpa);
      })
    );
    const sgpaTrend = Object.entries(semMap)
      .map(([sem, vals]) => ({
        sem: parseInt(sem),
        avgSgpa: parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)),
      }))
      .sort((a, b) => a.sem - b.sem);

    const selectedDepartment = req.query.department || (req.user.role === 'admin' ? 'all departments' : req.user.department);
    const statsPayload = {
      department: selectedDepartment,
      batch: req.query.batch || 'all batches',
      section: req.query.section || 'all sections',
      semester: req.query.semester || 'all semesters',
      academicYear: req.query.academicYear || 'all academic years',
      total, avgCgpa, withBacklogs: withBack, lowAttendance: lowAtt,
      atRisk, toppers, passRate, cgpaDistribution: dist, sgpaTrend,
    };

    const system = `You are an academic performance analyst for VFSTR university (Vignan's Foundation, Guntur, AP, India).
Analyze the department statistics and generate actionable academic insights.

Return ONLY raw JSON (no markdown, no code fences):
{
  "narrative": "<3-4 sentence paragraph summarizing the department academic health>",
  "insights": [
    { "type": "critical|warning|success|info", "text": "<specific insight with real numbers, under 20 words>" }
  ],
  "recommendations": [
    "<actionable recommendation for university staff, 1 sentence>"
  ]
}

Generate 5-7 insights and 3 recommendations. Be specific with numbers. Highlight both problems and positives.`;

    try {
      const raw    = await callAI(system, JSON.stringify(statsPayload));
      const clean  = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      return res.json({ ...parsed, stats: statsPayload });
    } catch (_) { /* fall through to rule-based */ }

    // Rule-based fallback (when API key not set or Claude unavailable)
    const insights = [
      { type: avgCgpa >= 7.5 ? 'success' : avgCgpa >= 6.5 ? 'info' : 'warning',
        text: `Average CGPA is ${avgCgpa} across ${total} students.` },
      { type: withBack / total > 0.3 ? 'critical' : withBack / total > 0.15 ? 'warning' : 'info',
        text: `${withBack} students (${((withBack/total)*100).toFixed(1)}%) have active backlogs.` },
      { type: lowAtt / total > 0.2 ? 'warning' : 'info',
        text: `${lowAtt} students (${((lowAtt/total)*100).toFixed(1)}%) have attendance below 75%.` },
      { type: atRisk > 0 ? 'critical' : 'success',
        text: `${atRisk} students are classified as academically at-risk.` },
      { type: 'success', text: `${toppers} students have CGPA ≥ 9.0 — top performers.` },
      { type: 'info',    text: `Overall pass rate is ${passRate}%.` },
    ];

    const recommendations = [
      atRisk > 0   ? `Counsel the ${atRisk} at-risk students and assign faculty mentors immediately.`    : 'Maintain current academic support programs.',
      lowAtt > 0   ? `Send formal attendance warnings to ${lowAtt} students below 75% threshold.`       : 'Attendance is healthy — continue monitoring.',
      withBack > 0 ? `Organise remedial classes for the ${withBack} students with active backlogs.`      : 'No backlog interventions needed currently.',
    ];

    res.json({
      narrative: `The ${selectedDepartment} slice has ${total} students with an average CGPA of ${avgCgpa}. ${atRisk} students require immediate academic intervention. The overall pass rate stands at ${passRate}% with ${toppers} high performers achieving CGPA above 9.0.`,
      insights, recommendations, stats: statsPayload,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── 4. INTERVENTION LETTER ───────────────────────────────────────────────
// POST /api/ai/intervention-letter
// Body: { rollNumber, department? }
// Returns: { letter: "..." }
router.post('/intervention-letter', async (req, res) => {
  try {
    const { rollNumber, department } = req.body;
    if (!rollNumber) return res.status(400).json({ message: 'rollNumber required' });

    const baseScope = {};
    if (req.user.role !== 'admin') baseScope.department = req.user.department;
    else if (department) baseScope.department = department;

    const student = await Student.findOne({ ...baseScope, rollNumber });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const semesters = [...(student.semesters || [])].sort((a, b) => a.semNumber - b.semNumber);
    const attendance = student.attendance || [];

    const avgCgpa = student.cgpa || 0;
    const backlogs = (student.backlogs || []).map(b => b.subjectName || b.subjectCode).join(', ');
    const avgAtt = attendance.length
      ? parseFloat((attendance.reduce((s, a) => s + (a.percentage || 0), 0) / attendance.length).toFixed(1))
      : null;
    const latestSem = semesters[semesters.length - 1];
    const latestSgpa = latestSem?.sgpa || null;

    const studentData = {
      name: student.name,
      rollNumber: student.rollNumber,
      department: student.department,
      section: student.section,
      batch: student.batch,
      currentSemester: student.currentSemester,
      cgpa: avgCgpa,
      latestSgpa,
      avgAttendance: avgAtt,
      activeBacklogs: backlogs || 'None',
      lowAttendanceSubjects: attendance.filter(a => (a.percentage || 0) < 75).map(a => a.subjectName || a.subjectCode).join(', ') || 'None',
    };

    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const system = `You are an academic officer at VFSTR (Vignan's Foundation for Science, Technology and Research), a deemed university in Guntur, Andhra Pradesh, India.

Draft a formal, professional academic intervention notice addressed to the student and their parents.

Structure the letter exactly as:
1. Letterhead line: "Vignan's Foundation for Science, Technology and Research (Deemed to be University)"
2. Date: ${today}
3. Subject line (bold): "Academic Intervention Notice — <Student Name>"
4. Salutation: "Dear <Student Name> and Parents/Guardians,"
5. Opening paragraph: State the purpose — academic performance review
6. Academic Status section: Mention CGPA, attendance, backlogs using the real numbers
7. Areas of Concern: Specific, numbered list of issues
8. Action Plan: 3-4 concrete steps the student must take
9. Closing: Professional tone, supportive but firm, mention counselor availability
10. Sign-off: "Academic Affairs Office, VFSTR University"

Keep it under 350 words. Be factual and use the student's actual data. Do not use markdown formatting — plain text paragraphs only.`;

    const raw = await callAI(system, JSON.stringify(studentData), [], 1500);

    return res.json({ letter: raw, student: studentData });
  } catch (err) {
    // Graceful fallback when AI unavailable
    if (err.message?.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ message: 'AI service not configured. Set GEMINI_API_KEY in .env to enable letter generation.' });
    }
    res.status(500).json({ message: err.message });
  }
});

// ── 5. NEXT-SEMESTER CGPA PREDICTION ────────────────────────────────────
// GET /api/ai/predict-cgpa/:rollNumber
// Returns: { predictions: [{ semester, predictedSgpa, predictedCgpa, confidence, reasoning }] }
router.get('/predict-cgpa/:rollNumber', async (req, res) => {
  try {
    const { rollNumber } = req.params;
    const baseScope = req.user.role !== 'admin' ? { department: req.user.department } : {};

    const student = await Student.findOne({ ...baseScope, rollNumber });
    if (!student) return res.status(404).json({ message: 'Student not found' });

    const semesters = [...(student.semesters || [])].sort((a, b) => a.semNumber - b.semNumber);
    if (semesters.length < 2) {
      return res.json({
        rollNumber,
        name: student.name,
        currentCgpa: student.cgpa || 0,
        predictions: [],
        message: 'Need at least 2 semesters of data to predict',
      });
    }

    // ── Statistical prediction (no AI needed — always runs) ──────────────
    const sgpas = semesters.map(s => s.sgpa || 0);
    const n = sgpas.length;

    // Weighted moving average (recent semesters weighted more)
    const weights = sgpas.map((_, i) => i + 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const wma = parseFloat((sgpas.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight).toFixed(2));

    // Linear trend via least-squares
    const meanX = (n - 1) / 2;
    const meanY = sgpas.reduce((a, b) => a + b, 0) / n;
    const slope = sgpas.reduce((s, v, i) => s + (i - meanX) * (v - meanY), 0) /
                  sgpas.reduce((s, _, i) => s + Math.pow(i - meanX, 2), 0);

    // Variance for confidence
    const variance = sgpas.reduce((s, v) => s + Math.pow(v - meanY, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const nextSem = semesters[semesters.length - 1].semNumber + 1;
    const lastSgpa = sgpas[n - 1];
    const trend = slope;

    // Blend WMA (60%) with trend projection (40%)
    const predictedSgpa = Math.max(0, Math.min(10,
      parseFloat((0.6 * wma + 0.4 * (lastSgpa + trend)).toFixed(2))
    ));

    // Predict CGPA after next semester
    let cumulativeSum = sgpas.reduce((a, b) => a + b, 0);
    const predictedCgpa = Math.max(0, Math.min(10,
      parseFloat(((cumulativeSum + predictedSgpa) / (n + 1)).toFixed(2))
    ));

    // Confidence: high if low variance and enough data points
    const confidenceScore = Math.max(30, Math.min(95,
      Math.round(80 - stdDev * 15 + Math.min(n, 6) * 2)
    ));

    const trendLabel = trend > 0.3 ? 'improving' : trend < -0.3 ? 'declining' : 'stable';
    const reasoning = `Based on ${n} semesters of data (SGPA trend: ${trendLabel}, σ=${stdDev.toFixed(2)}). ` +
      `Weighted moving average: ${wma}. Linear slope: ${trend > 0 ? '+' : ''}${slope.toFixed(3)} per semester.`;

    // ── AI-enhanced narrative (optional, falls back gracefully) ──────────
    let narrative = null;
    try {
      const aiSystem = `You are an academic counselor at VFSTR university. Given a student's SGPA history, write 2 concise sentences:
1. What the prediction means for this student
2. One specific academic advice

Keep it under 50 words total. Be encouraging but honest.`;
      const aiInput = JSON.stringify({
        name: student.name, sgpaHistory: sgpas,
        predictedSgpa, predictedCgpa, trend: trendLabel, confidence: confidenceScore,
      });
      narrative = await callAI(aiSystem, aiInput);
    } catch (_) { /* AI unavailable — skip */ }

    return res.json({
      rollNumber,
      name: student.name,
      department: student.department,
      currentCgpa: student.cgpa || 0,
      sgpaHistory: semesters.map(s => ({ semester: s.semNumber, sgpa: s.sgpa || 0, academicYear: s.academicYear })),
      predictions: [{
        semester: nextSem,
        predictedSgpa,
        predictedCgpa,
        confidence: confidenceScore,
        trendLabel,
        reasoning,
        narrative,
      }],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
