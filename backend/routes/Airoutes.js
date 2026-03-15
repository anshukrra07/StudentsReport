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

router.use(authenticate);

function buildFilter(user, q = {}) {
  const f = {};
  if (user.role !== 'admin') f.department = user.department;
  else if (q.department)     f.department = q.department;
  if (q.batch)   f.batch   = q.batch;
  if (q.section) f.section = q.section;
  return f;
}

const GEMINI_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-2.5-flash-lite-preview-06-17',
  'gemini-2.5-flash',
  'gemini-1.5-flash',
].filter(Boolean);

function extractText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map(part => part?.text || '')
    .join('')
    .trim();
}

// ── Gemini API call ───────────────────────────────────────────────────────
async function callAI(systemPrompt, userMsg) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in .env');

  let lastError = null;

  for (const model of GEMINI_MODELS) {
    try {
      const res = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userMsg }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 900,
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
    let { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ message: 'message required' });

    // ── Conversational fallback mode ──────────────────────────────────────
    // Frontend sends __CONVERSE__: prefix when the first AI attempt failed
    // In this mode we use a looser prompt that tries its best to map to a report
    // but is allowed to return report: null for truly unrelated messages
    const isConverse = message.startsWith('__CONVERSE__:');
    if (isConverse) message = message.replace('__CONVERSE__:', '').trim();

    const system = isConverse
      ? `You are an academic report assistant for VFSTR university (Vignan's Foundation, Guntur, AP, India).

The user has sent a vague or unclear message. Try your best to map it to the closest academic report.
If the message has ANY hint of academic data (students, marks, attendance, results, performance, rank, backlog, risk, topper, CGPA, semester, department), map it to a report.
If it is completely unrelated to academic reports (e.g. weather, jokes, random chat), return report: null.

Valid reports: attendance | marks | backlogs | cgpa | risk | toppers
Valid departments: CSE | ECE | MECH | CIVIL | EEE (or null)

Return ONLY raw JSON:
{
  "report": "<type or null>",
  "department": null,
  "batch": null,
  "section": null,
  "semester": null,
  "academicYear": null,
  "type": null,
  "threshold": null,
  "limit": null,
  "intent": "<what you think the user wants, or 'unclear request'>"
}`
      : `You are an academic data assistant for VFSTR university (Vignan's Foundation, Guntur, AP, India).
Convert the user's natural language question into a structured JSON query.

Valid values:
- report: attendance | marks | backlogs | cgpa | risk | toppers
- department: CSE | ECE | MECH | CIVIL | EEE (or null)
- section: A | B | C (or null)
- semester: 1-8 (or null)
- batch: 2021-2025 | 2022-2026 | 2023-2027 | 2024-2028 (or null)
- academicYear: "2023-2024" format (or null)
- type:
    attendance: section_wise | subject_wise | department_wise | low_attendance
    marks: internal | external | semester_summary | subject_performance
    cgpa: ranking | toppers | distribution
    risk: low_cgpa | backlogs | low_attendance (or null for all)
- threshold: number for attendance % (or null)
- limit: number for top N (or null)
- intent: one clear sentence describing what the user wants

Return ONLY raw JSON. No markdown, no code fences, no explanation.`;

    const raw    = await callAI(system, message);
    const clean  = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

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
      const cgpa     = s.cgpa || 0;
      const attPcts  = s.attendance.map(a => a.percentage);
      const avgAtt   = attPcts.length
        ? parseFloat((attPcts.reduce((a, b) => a + b, 0) / attPcts.length).toFixed(1)) : 100;

      const sems = [...s.semesters].sort((a, b) => a.semNumber - b.semNumber);
      let cgpaTrend = 0;
      if (sems.length >= 2)
        cgpaTrend = parseFloat((sems[sems.length - 1].sgpa - sems[sems.length - 2].sgpa).toFixed(2));

      const dangerSubjects = sems.flatMap(sm => sm.subjects.filter(sub => sub.total < 40)).length;
      const backlogCount   = s.backlogs.length;

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
      if (cgpaTrend < -1.5)      score += 10;
      else if (cgpaTrend < -0.5) score += 6;
      else if (cgpaTrend < 0)    score += 2;
      // Danger subs: 5 pts
      if (dangerSubjects >= 3)      score += 5;
      else if (dangerSubjects >= 1) score += 2;

      const riskProbability = Math.min(100, score);
      const riskLevel = riskProbability >= 70 ? 'HIGH' : riskProbability >= 40 ? 'MEDIUM' : 'LOW';

      const riskFactors = [
        ...(cgpa < 6.0         ? [`Low CGPA (${cgpa})`]                         : []),
        ...(avgAtt < 75        ? [`Avg attendance ${avgAtt}%`]                   : []),
        ...(backlogCount > 0   ? [`${backlogCount} active backlog(s)`]           : []),
        ...(cgpaTrend < -0.5   ? [`CGPA declining (${cgpaTrend} last sem)`]      : []),
        ...(dangerSubjects > 0 ? [`${dangerSubjects} subject(s) below 40 marks`] : []),
      ];

      return {
        rollNumber: s.rollNumber, name: s.name,
        department: s.department, section: s.section, batch: s.batch,
        cgpa, avgAttendance: avgAtt, backlogCount, cgpaTrend, dangerSubjects,
        riskProbability, riskLevel, riskFactors,
      };
    });

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
    const students = await Student.find(filter);
    if (!students.length)
      return res.json({ narrative: 'No data found for selected filters.', insights: [], recommendations: [] });

    const total    = students.length;
    const avgCgpa  = parseFloat((students.reduce((s, x) => s + x.cgpa, 0) / total).toFixed(2));
    const withBack = students.filter(s => s.backlogs.length > 0).length;
    const lowAtt   = students.filter(s => s.attendance.some(a => a.percentage < 75)).length;
    const atRisk   = students.filter(s => s.cgpa < 6.0 || s.backlogs.length >= 2).length;
    const toppers  = students.filter(s => s.cgpa >= 9.0).length;
    const passRate = parseFloat(((students.filter(s => s.backlogs.length === 0).length / total) * 100).toFixed(1));

    const dist = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, 'below 6': 0 };
    students.forEach(s => {
      if (s.cgpa >= 9)      dist['9-10']++;
      else if (s.cgpa >= 8) dist['8-9']++;
      else if (s.cgpa >= 7) dist['7-8']++;
      else if (s.cgpa >= 6) dist['6-7']++;
      else                  dist['below 6']++;
    });

    const semMap = {};
    students.forEach(s =>
      s.semesters.forEach(sm => {
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

    const statsPayload = {
      department: req.query.department || req.user.department,
      batch: req.query.batch || 'all batches',
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
      narrative: `The ${req.query.department || req.user.department} department has ${total} students with an average CGPA of ${avgCgpa}. ${atRisk} students require immediate academic intervention. The overall pass rate stands at ${passRate}% with ${toppers} high performers achieving CGPA above 9.0.`,
      insights, recommendations, stats: statsPayload,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;