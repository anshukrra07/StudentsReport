import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToCSV, flattenForExport } from '../utils/exportUtils';

// ── Suggestion groups ─────────────────────────────────────────────────────
const SUGG_GROUPS = [
  { label:'📋 Attendance', color:'#0ea5e9', bg:'#f0f9ff', items:[
    'Show section-wise attendance for CSE',
    'Subject-wise attendance report semester 2',
    'Department-wise attendance analysis',
    'Low attendance students below 75%',
    'Attendance for academic year 2023-2024',
  ]},
  { label:'📊 Marks', color:'#f59e0b', bg:'#fffbeb', items:[
    'Internal marks report CSE semester 2',
    'External marks for batch 2022-2026',
    'Semester result summary for all students',
    'Subject performance analysis semester 3',
    'Marks for academic year 2023-2024',
  ]},
  { label:'⚠️ Backlogs', color:'#ef4444', bg:'#fff1f2', items:[
    'List students with backlogs',
    'Students with repeated subjects',
    'Pending course completions',
  ]},
  { label:'⭐ CGPA', color:'#8b5cf6', bg:'#f5f3ff', items:[
    'CGPA distribution across departments',
    'Student ranking list for CSE',
    'Academic toppers top 10',
  ]},
  { label:'⚡ Risk', color:'#f97316', bg:'#fff7ed', items:[
    'At-risk students low CGPA',
    'Students with multiple backlogs',
    'Low attendance risk report',
  ]},
  { label:'🏆 Toppers', color:'#10b981', bg:'#f0fdf4', items:[
    'Top performers batch 2022-2026',
    'Top 5 CSE students by CGPA',
  ]},
];

const TYPE_META = {
  attendance:{ color:'#0ea5e9', bg:'#f0f9ff', label:'Attendance',     icon:'📋' },
  marks:     { color:'#f59e0b', bg:'#fffbeb', label:'Marks',          icon:'📊' },
  backlogs:  { color:'#ef4444', bg:'#fff1f2', label:'Backlogs',       icon:'⚠️' },
  cgpa:      { color:'#8b5cf6', bg:'#f5f3ff', label:'CGPA',           icon:'⭐' },
  risk:      { color:'#f97316', bg:'#fff7ed', label:'At-Risk',        icon:'⚡' },
  toppers:   { color:'#10b981', bg:'#f0fdf4', label:'Top Performers', icon:'🏆' },
};

// ── NLP Parser ────────────────────────────────────────────────────────────
function parseMsg(msg) {
  const l = msg.toLowerCase();
  let rt = null, p = {};
  if(l.includes('attendance')){
    rt='attendance';
    if(l.includes('low')||l.includes('shortage')||l.includes('below')) p.type='low_attendance';
    else if(l.includes('subject')) p.type='subject_wise';
    else if(l.includes('department')||l.includes('dept')) p.type='department_wise';
    else p.type='section_wise';
  }
  else if(l.includes('internal marks')||l.includes('internal report')) { rt='marks'; p.type='internal'; }
  else if(l.includes('external marks')||l.includes('external report')) { rt='marks'; p.type='external'; }
  else if(l.includes('semester result')||l.includes('result summar'))  { rt='marks'; p.type='semester_summary'; }
  else if(l.includes('subject performance'))                            { rt='marks'; p.type='subject_performance'; }
  else if(l.includes('marks')||l.includes('result'))                   { rt='marks'; p.type='external'; }
  else if(l.includes('repeated subject'))  { rt='backlogs'; p.backlogType='repeated'; }
  else if(l.includes('pending')||l.includes('course completion')) { rt='backlogs'; p.backlogType='pending'; }
  else if(l.includes('backlog')||l.includes('arrear')) { rt='backlogs'; }
  else if(l.includes('cgpa distribution')) { rt='cgpa'; p.type='distribution'; }
  else if(l.includes('ranking')||l.includes('rank list')) { rt='cgpa'; p.type='ranking'; }
  else if(l.includes('topper')||l.includes('academic topper')) { rt='cgpa'; p.type='toppers'; }
  else if(l.includes('cgpa')) { rt='cgpa'; p.type='ranking'; }
  else if(l.includes('low cgpa risk'))       { rt='risk'; p.riskType='low_cgpa'; }
  else if(l.includes('multiple backlog'))    { rt='risk'; p.riskType='backlogs'; }
  else if(l.includes('low attendance risk')) { rt='risk'; p.riskType='low_attendance'; }
  else if(l.includes('risk')||l.includes('at-risk')||l.includes('at risk')) { rt='risk'; }
  else if(l.includes('top performer')||l.includes('best student')) { rt='toppers'; }
  ['CSE','ECE','MECH','CIVIL','EEE'].forEach(d=>{ if(l.includes(d.toLowerCase())) p.department=d; });
  const sec=l.match(/section\s+([abc])/i); if(sec) p.section=sec[1].toUpperCase();
  const sem=l.match(/sem(?:ester)?\s*(\d)/i); if(sem) p.semester=sem[1];
  const bat=l.match(/batch\s+(20\d{2}[-–]20\d{2})/i)||l.match(/(20\d{2}[-–]20\d{2})/); if(bat) p.batch=bat[1].replace('–','-');
  // Academic year: "academic year 2023-24", "2023-24", "ay 2023-2024", "year 2024-25"
  const ayFull=l.match(/(?:academic\s*year|ay|for)\s*(20\d{2}[-–]20\d{2})/i);
  const ayShort=l.match(/(?:academic\s*year|ay|for)\s*(20\d{2})[-–](\d{2})/i);
  if(ayFull) p.academicYear=ayFull[1].replace('–','-');
  else if(ayShort) p.academicYear=`${ayShort[1]}-20${ayShort[2]}`;
  const thr=l.match(/below\s+(\d+)/i)||l.match(/(\d+)\s*%/); if(thr&&rt==='attendance') p.threshold=thr[1];
  const lim=l.match(/top\s+(\d+)/i); if(lim) p.limit=lim[1];
  return {rt,p};
}
function getEndpoint(rt, p) {
  const map = {
    attendance:`/reports/attendance?type=${p.type||'section_wise'}`,
    marks:`/reports/marks?type=${p.type||'external'}`,
    backlogs:`/reports/backlogs?`,
    cgpa:`/reports/cgpa?type=${p.type||'ranking'}`,
    risk:`/reports/risk?riskType=${p.riskType||''}`,
    toppers:`/reports/top-performers?`,
  };
  return map[rt]||`/reports/${rt}?`;
}

// ── Mini result table ─────────────────────────────────────────────────────
function MiniTable({data,type,subType}) {
  const [hov,setHov]=useState(null);
  if(!data||!data.length) return <p style={{color:'#94a3b8',fontSize:12,marginTop:8}}>No records found.</p>;
  const autoKeys=Object.keys(data[0]).filter(k=>!['students','semesters','attendance','lowSubjects','failedSubjects','repeatedSubjects'].includes(k)).slice(0,7);
  const COLS={
    attendance:['rollNumber','name','department','section','avgAttendance'],
    marks:['rollNumber','name','department','section','cgpa'],
    backlogs:['rollNumber','name','department','batch','backlogCount','repeatedCount'],
    cgpa:['rank','rollNumber','name','department','cgpa'],
    toppers:['rank','rollNumber','name','department','cgpa'],
    risk:['rollNumber','name','department','cgpa','backlogCount','riskScore'],
    semester_summary:['semester','academicYear','totalStudents','pass','fail','avgSgpa','passPercent'],
    subject_performance:['subjectCode','subjectName','semester','avgTotal','passCount','failCount','passRate'],
    distribution:['label','count'],
  };
  const cols=COLS[subType]||COLS[type]||autoKeys;
  const tm=TYPE_META[type]||TYPE_META.attendance;
  const cc=(col,val)=>{
    if(['cgpa','avgSgpa'].includes(col)) return parseFloat(val)>=8?'#10b981':parseFloat(val)>=6?'#f59e0b':'#ef4444';
    if(['pass','passCount'].includes(col)) return '#10b981';
    if(['fail','failCount'].includes(col)) return '#ef4444';
    if(['passPercent','passRate'].includes(col)) return parseFloat(val)>=75?'#10b981':'#f59e0b';
    if(col==='backlogCount'||col==='repeatedCount') return '#ef4444';
    if(col==='rank') return '#f59e0b';
    if(col==='riskScore') return '#f97316';
    return '#374151';
  };
  return (
    <div style={{overflowX:'auto',borderRadius:10,border:`1px solid ${tm.color}25`,marginTop:12,background:'#fff'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
        <thead>
          <tr style={{background:tm.bg}}>
            {cols.map(c=>(
              <th key={c} style={{color:tm.color,padding:'8px 12px',textAlign:'left',fontWeight:800,fontSize:9,textTransform:'uppercase',letterSpacing:'0.8px',whiteSpace:'nowrap',borderBottom:`1.5px solid ${tm.color}20`}}>
                {c.replace(/([A-Z])/g,' $1').replace(/_/g,' ').trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0,15).map((r,i)=>(
            <tr key={i}
              style={{background:hov===i?tm.bg:'#fff',transition:'background 0.15s',borderLeft:`2px solid ${hov===i?tm.color:'transparent'}`}}
              onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}>
              {cols.map(c=>{
                const raw=r[c];
                const display=Array.isArray(raw)?raw.join(', '):(raw!==undefined&&raw!==null&&raw!=='')?String(raw):null;
                return (
                  <td key={c} style={{color:display?cc(c,raw):'#e2e8f0',padding:'7px 12px',whiteSpace:'nowrap',borderTop:'1px solid #f8faff',fontWeight:['cgpa','avgSgpa','pass','fail','passPercent','passRate','rank','backlogCount','riskScore'].includes(c)?700:400}}>
                    {display||<span style={{color:'#e2e8f0'}}>—</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length>15&&<div style={{color:'#94a3b8',fontSize:10,padding:'7px 12px',borderTop:`1px solid ${tm.color}15`,background:'#fafbff'}}>Showing 15 of {data.length} — export for full data</div>}
    </div>
  );
}

// ── Voice waveform animation ───────────────────────────────────────────────
function VoiceWaveform({isListening}) {
  return (
    <div style={{display:'flex',alignItems:'center',gap:3,height:24}}>
      {[1,1.5,2,1.8,1.2,2.2,1,1.6,1.3,1.9].map((h,i)=>(
        <div key={i} style={{
          width:3, borderRadius:3,
          background: isListening ? '#ef4444' : '#94a3b8',
          height: isListening ? `${h*8}px` : '4px',
          transition:'height 0.15s ease',
          animation: isListening ? `voiceBar 0.6s ${i*0.07}s ease-in-out infinite alternate` : 'none',
        }}/>
      ))}
      <style>{`
        @keyframes voiceBar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}

// ── Main Chatbot component ────────────────────────────────────────────────
export default function Chatbot() {
  const {API} = useAuth();
  const [msgs, setMsgs] = useState([{
    role:'bot', type:null, subType:'',
    text:'👋 Namaste! I am the VFSTR Report Assistant.\n\nYou can type OR 🎤 speak your query!\n\nI understand:\n📋 Attendance — section, subject, dept, low\n📊 Marks — internal, external, results, performance\n⚠️  Backlogs — list, repeated, pending\n⭐ CGPA — distribution, rankings, toppers\n⚡ Risk — low CGPA, backlogs, attendance\n🏆 Top Performers\n\nTry: "Show low attendance for CSE below 75%"',
    time:new Date()
  }]);
  const [inp, setInp]           = useState('');
  const [busy, setBusy]         = useState(false);
  const [hovS, setHovS]         = useState('');
  const [hovB, setHovB]         = useState('');
  const [emailForm, setEmailForm] = useState({ visible:false, email:'', sending:false, sent:false, sentMode:'', sentFreq:'', msgIdx:null, showSchedule:false, freq:'weekly' });

  // ── Voice recognition state ──
  const [isListening, setIsListening]         = useState(false);
  const [voiceSupported, setVoiceSupported]   = useState(false);
  const [voiceStatus, setVoiceStatus]         = useState('');   // status text
  const [transcript, setTranscript]           = useState('');   // live transcript
  const [voiceError, setVoiceError]           = useState('');
  const recognitionRef = useRef(null);
  const voiceErrorRef  = useRef('');           // ref to track error state in closures
  const endRef         = useRef();

  useEffect(()=>{ endRef.current?.scrollIntoView({behavior:'smooth'}); },[msgs]);

  // Check browser voice support on mount
  useEffect(()=>{
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(SpeechRecognition){
      setVoiceSupported(true);
      const rec = new SpeechRecognition();
      rec.continuous      = false;
      rec.interimResults  = true;
      rec.lang            = 'en-IN';  // Indian English
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsListening(true);
        setVoiceStatus('🎤 Listening... speak now');
        setVoiceError('');
        setTranscript('');
      };

      rec.onresult = (e) => {
        let interim = '';
        let final   = '';
        for(let i=e.resultIndex; i<e.results.length; i++){
          const t = e.results[i][0].transcript;
          if(e.results[i].isFinal) final += t;
          else interim += t;
        }
        setTranscript(final || interim);
        setVoiceStatus(final ? '✅ Got it! Processing...' : '🎤 Listening...');
        if(final){
          setInp(final);
          setVoiceStatus('✅ Click Send or press Enter');
        }
      };

      rec.onerror = (e) => {
        setIsListening(false);
        setTranscript('');
        const errMsgs = {
          'no-speech':     '⚠️ No speech detected. Try again.',
          'not-allowed':   '❌ Microphone permission denied. Please allow microphone access.',
          'network':       '⚠️ Network error during voice recognition.',
          'audio-capture': '❌ No microphone found.',
          'aborted':       '',
        };
        const msg = errMsgs[e.error] || `⚠️ Voice error: ${e.error}`;
        voiceErrorRef.current = msg;   // keep ref in sync before state update
        setVoiceError(msg);
        setVoiceStatus('');
      };

      rec.onend = () => {
        setIsListening(false);
        // Use ref so this closure always sees the latest error value
        if (!voiceErrorRef.current) setVoiceStatus('');
        voiceErrorRef.current = '';    // reset for next session
      };

      recognitionRef.current = rec;
    }
  },[]);

  const toggleVoice = useCallback(()=>{
    if(!voiceSupported) return;
    if(isListening){
      recognitionRef.current?.stop();
      setIsListening(false);
      setVoiceStatus('');
    } else {
      setVoiceError('');
      setTranscript('');
      setInp('');
      try{
        recognitionRef.current?.start();
      } catch(e){
        setVoiceError('⚠️ Microphone already in use or permission denied.');
      }
    }
  },[isListening, voiceSupported]);

  const push = (role,text,data=null,type=null,subType='',intent='',quickPicks=null,action=null) =>
    setMsgs(p=>[...p,{role,text,data,type,subType,intent,quickPicks,action,time:new Date()}]);

  // ── Conversational replies (no AI/keyword needed) ────────────────────
  const CONV_REPLIES = [
    { match: /^(hey|hi|hello|helo|hii|namaste|sup|yo)\b/i,
      reply: `👋 Hello! I'm the VFSTR Report Assistant.\n\nI can help you generate academic reports. Try:\n• "Show attendance for CSE"\n• "Top 10 CGPA performers"\n• "At-risk students batch 2022-2026"\n• "Backlogs for ECE semester 3"\n\nOr use the 🎤 mic button to speak your query!` },
    { match: /^(how are you|how r u|how do you do|what's up|wassup)/i,
      reply: `😊 I'm doing great, thanks for asking!\n\nI'm here to help you generate department reports instantly.\n\nWhat report would you like? Try:\n• "Show low attendance CSE"\n• "CGPA distribution"\n• "At-risk students"` },
    { match: /^(thank|thanks|thank you|thx|ty|tq)\b/i,
      reply: `😊 You're welcome! Feel free to ask for any report anytime.\n\nNeed anything else? Just type your query or use the 🎤 mic!` },
    { match: /^(bye|goodbye|see you|cya|ok bye)\b/i,
      reply: `👋 Goodbye! Come back anytime you need a report.\n\nHave a great day! 😊` },
    { match: /^(help|what can you do|what do you do|capabilities|features)\b/i,
      reply: `🤖 I can generate these reports for VFSTR:\n\n📋 Attendance — section, subject, dept, low\n📊 Marks — internal, external, results, performance\n⚠️  Backlogs — list, repeated, pending\n⭐ CGPA — distribution, rankings, toppers\n⚡ Risk — low CGPA, backlogs, attendance\n🏆 Top Performers\n\nJust type naturally! Examples:\n• "Show CSE semester 3 attendance"\n• "Which ECE students are at risk?"\n• "Top 5 students by CGPA"` },
    { match: /^(who are you|what are you|introduce yourself)\b/i,
      reply: `🎓 I'm the VFSTR Report Assistant — an AI-powered chatbot for Vignan's Foundation for Science, Technology & Research.\n\nI help DEOs and faculty generate academic reports instantly using natural language.\n\nJust ask me for any report!` },
    { match: /^(ok|okay|k)\s*$/i,
      reply: `👍 Sure! What report would you like?\n\nTry: "Show attendance for CSE" or "At-risk students"` },
    { match: /^(ok|okay)\s+.{1,30}$/i,
      // "ok give something", "ok show me something", "ok suggest" etc
      reply: null, // null = use AI conversational reply below
    },
  ];

  // ── Generic "generate report" phrases → show quick-pick buttons ───────
  const GENERIC_REPORT = /^(generate|create|make|show|get|give|produce|fetch|pull|run|display|view|open|load)\s+(a\s+)?(report|reports|data|all|everything|summary|details|full|complete|academic|department|student)\s*$/i;

  const QUICK_PICKS = [
    { label:'📋 Attendance',    query:'Show section-wise attendance',        color:'#0ea5e9', bg:'#f0f9ff' },
    { label:'📊 Marks',         query:'Show external marks report',          color:'#f59e0b', bg:'#fffbeb' },
    { label:'⚠️ Backlogs',      query:'List students with backlogs',         color:'#ef4444', bg:'#fff1f2' },
    { label:'⭐ CGPA Rankings', query:'Show student CGPA ranking list',      color:'#8b5cf6', bg:'#f5f3ff' },
    { label:'⚡ At-Risk',       query:'Show at-risk students report',        color:'#f97316', bg:'#fff7ed' },
    { label:'🏆 Top Performers',query:'Show top 10 performers by CGPA',     color:'#10b981', bg:'#f0fdf4' },
    { label:'📉 Low Attendance',query:'Low attendance students below 75%',  color:'#0284c7', bg:'#e0f2fe' },
    { label:'📈 CGPA Dist.',    query:'CGPA distribution across departments',color:'#7c3aed', bg:'#faf5ff' },
  ];

  // ── Build a flat set of all static suggestion strings for O(1) lookup ──
  const STATIC_PROMPTS = new Set([
    ...SUGG_GROUPS.flatMap(g => g.items),
    ...QUICK_PICKS.map(q => q.query),
  ]);

  // ── Smart send ────────────────────────────────────────────────────────
  // Static prompt  → keyword parser (instant, no API call)
  // Conversational → friendly reply (instant, no API call)
  // Generic report → quick-pick buttons (instant, no API call)
  // Everything else → Gemini AI (understands full natural language)
  const send = useCallback(async (msg=inp) => {
    if(!msg.trim()) return;
    if(isListening){ recognitionRef.current?.stop(); setIsListening(false); }
    setInp(''); setTranscript(''); setVoiceStatus('');
    push('user', msg); setBusy(true);

    try {
      // ── Step 0: conversational messages ──────────────────────────────
      const conv = CONV_REPLIES.find(c => c.match.test(msg.trim()));
      if (conv && conv.reply) { push('bot', conv.reply); setBusy(false); return; }
      // conv.reply === null means: vague/unclear → fall through to AI conversational

      // ── Step 0.5: generic "generate report" → quick-pick buttons ─────
      if (GENERIC_REPORT.test(msg.trim())) {
        push('bot', 'Sure! Which type of report would you like to generate?\n\nClick one below or type something more specific:', null, null, '', '', QUICK_PICKS);
        setBusy(false); return;
      }

      // ── Step 0.6: email intent → show inline email form ───────────────
      const emailIntent = /\b(send|email|mail|forward|deliver|share)\b.{0,40}\b(report|data|results|marks|attendance|summary)\b|\b(report|data|results)\b.{0,20}\b(to|via)\b.{0,20}\b(email|mail)\b/i;
      if (emailIntent.test(msg.trim())) {
        const msgIdx = msgs.length + 1; // index of the bot reply we're about to push
        push('bot', '📧 Sure! Enter the email address to send the report to:', null, null, '', '', null, { type:'emailForm', msgIdx });
        setBusy(false); return;
      }

      let rt, p, endpoint, intent='', usedAI=false;

      // ── Step 1: static prompt → keyword parser (instant, zero API) ───
      if (STATIC_PROMPTS.has(msg.trim())) {
        const kw = parseMsg(msg);
        if (kw.rt) {
          rt = kw.rt; p = kw.p;
          const qp = new URLSearchParams();
          const SKIP = ['type','riskType','backlogType','limit'];
          Object.entries(p).forEach(([k,v])=>{ if(!SKIP.includes(k) && v) qp.append(k,v); });
          if(p.riskType)    qp.append('riskType', p.riskType);
          if(p.backlogType) qp.append('subtype',  p.backlogType);
          if(p.limit)       qp.append('limit',    p.limit);
          endpoint = `${getEndpoint(rt,p)}&${qp}`;
        }
      }

      // ── Step 2: everything else → Gemini AI ──────────────────────────
      if (!rt) {
        usedAI = true;
        try {
          const aiRes = await axios.post(`${API}/ai/query`, { message: msg }, { timeout: 12000 });
          const { parsed, endpoint: ep, intent: aiIntent } = aiRes.data;
          if (parsed?.report && ep) {
            rt = parsed.report; endpoint = ep; intent = aiIntent || '';
            p = {
              ...(parsed.department   && { department:   parsed.department   }),
              ...(parsed.batch        && { batch:        parsed.batch        }),
              ...(parsed.section      && { section:      parsed.section      }),
              ...(parsed.semester     && { semester:     parsed.semester     }),
              ...(parsed.academicYear && { academicYear: parsed.academicYear }),
              ...(parsed.threshold    && { threshold:    parsed.threshold    }),
              ...(parsed.limit        && { limit:        parsed.limit        }),
            };
          }
        } catch (_) { /* AI unavailable — fall through */ }

        // ── Step 3: AI also failed → keyword parser as last resort ─────
        if (!rt) {
          const kw = parseMsg(msg);
          if (kw.rt) {
            rt = kw.rt; p = kw.p; usedAI = false;
            const qp = new URLSearchParams();
            const SKIP = ['type','riskType','backlogType','limit'];
            Object.entries(p).forEach(([k,v])=>{ if(!SKIP.includes(k) && v) qp.append(k,v); });
            if(p.riskType)    qp.append('riskType', p.riskType);
            if(p.backlogType) qp.append('subtype',  p.backlogType);
            if(p.limit)       qp.append('limit',    p.limit);
            endpoint = `${getEndpoint(rt,p)}&${qp}`;
          }
        }

        if (!rt) {
          // Ask Gemini to reply conversationally rather than showing a static error
          try {
            const convRes = await axios.post(`${API}/ai/query`,
              { message: `__CONVERSE__: ${msg}` }, { timeout: 10000 }
            );
            // If Gemini still returns a report, use it
            if (convRes.data?.parsed?.report && convRes.data?.endpoint) {
              rt       = convRes.data.parsed.report;
              endpoint = convRes.data.endpoint;
              intent   = convRes.data.intent || '';
              p = convRes.data.parsed;
            }
          } catch(_) {}

          if (!rt) {
            push('bot', `🤔 I'm not sure what report you need for that.\n\nHere's what I can generate — click one to get started:`, null, null, '', '', QUICK_PICKS);
            setBusy(false); return;
          }
        }
      }

      // ── Step 4: fetch the report data ────────────────────────────────
      const res  = await axios.get(`${API}${endpoint}`);
      const raw  = res.data;
      const data = raw.data || (raw.distribution ? raw.distribution : []);
      const cnt  = raw.count ?? data.length;
      const tm   = TYPE_META[rt] || TYPE_META.attendance;
      const LABEL_MAP = { department:'dept', section:'sec', semester:'sem', batch:'batch', academicYear:'AY', threshold:'threshold%', limit:'top' };
      const fd = Object.entries(p||{})
        .filter(([k])=>!['type','riskType','backlogType'].includes(k) && p[k])
        .map(([k,v])=>`${LABEL_MAP[k]||k}: ${v}`).join(' · ');

      const aiLabel = usedAI && intent ? `\n🤖 AI: "${intent}"` : '';
      const src     = !usedAI ? '\n⚡ Instant' : '';
      push('bot', `${tm.icon} ${tm.label} Report Generated!${aiLabel}${src}\n✅ ${cnt} records found${fd?'\n🔍 Filters: '+fd:''}`, data, rt, p?.type||p?.backlogType||'', intent);

    } catch(e) {
      push('bot', `❌ Error: ${e.response?.data?.message||e.message}`);
    }
    setBusy(false);
  },[API, inp, isListening]);

  const doExport=(fmt,data,type)=>{
    const flat=flattenForExport(data,type);
    fmt==='excel'?exportToExcel(flat,`${type}_report`):exportToCSV(flat,`${type}_report`);
  };

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={S.head}>
        <img src="/campus/n_block.jpg" alt="campus" style={S.headBg} onError={e=>e.target.style.display='none'}/>
        <div style={S.headGrad}/>
        <div style={S.headContent}>
          <div style={{display:'flex',alignItems:'center',gap:12,position:'relative',zIndex:1}}>
            <div style={S.headAv}>💬</div>
            <div>
              <h2 style={S.headTitle}>VFSTR Report Chatbot</h2>
              <p style={S.headSub}>Vignan's Foundation for Science, Technology & Research (Deemed to be University)</p>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12,position:'relative',zIndex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(124,58,237,0.25)',backdropFilter:'blur(8px)',border:'1px solid rgba(167,139,250,0.4)',padding:'5px 12px',borderRadius:20}}>
              <span style={{fontSize:12}}>🤖</span>
              <span style={{color:'#e9d5ff',fontSize:11,fontWeight:600}}>AI-Powered</span>
            </div>
            {voiceSupported && (
              <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,0.12)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.2)',padding:'5px 12px',borderRadius:20}}>
                <span style={{fontSize:12}}>🎤</span>
                <span style={{color:'rgba(255,255,255,0.85)',fontSize:11,fontWeight:600}}>Voice Enabled</span>
              </div>
            )}
            <div style={{display:'flex',alignItems:'center',gap:7,background:'rgba(255,255,255,0.12)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.2)',padding:'5px 12px',borderRadius:20}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981',animation:'pulse 2s ease-in-out infinite'}}/>
              <span style={{color:'#fff',fontSize:11,fontWeight:600}}>Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Suggestion chips ── */}
      <div style={S.sugSection}>
        <div style={{color:'#94a3b8',fontSize:10,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.8px'}}>Quick suggestions — click or speak</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
          {SUGG_GROUPS.map(g=>g.items.map(s=>(
            <button key={s} style={{
              background: hovS===s?g.bg:'#f8faff',
              border:`1.5px solid ${hovS===s?g.color:'#e2e8f8'}`,
              color: hovS===s?g.color:'#64748b',
              borderRadius:20,padding:'5px 12px',fontSize:11,cursor:'pointer',
              transition:'all 0.2s',fontWeight:600,whiteSpace:'nowrap',
              transform: hovS===s?'translateY(-2px)':'none',
              boxShadow: hovS===s?`0 4px 12px ${g.color}25`:'none',
            }}
              onClick={()=>send(s)} onMouseEnter={()=>setHovS(s)} onMouseLeave={()=>setHovS('')}
            >{s}</button>
          )))}
        </div>
      </div>

      {/* ── Chat messages ── */}
      <div style={S.chat}>
        {msgs.map((m,i)=>{
          const tm=m.type?(TYPE_META[m.type]||TYPE_META.attendance):null;
          return (
            <div key={i} style={{...S.row,justifyContent:m.role==='user'?'flex-end':'flex-start',animation:'fadeUp 0.3s ease'}}>
              {m.role==='bot'&&<div style={S.botAv}>🎓</div>}
              <div style={{maxWidth:m.data?'88%':'65%'}}>
                <div style={m.role==='user'?S.userBubble:{...S.botBubble,borderColor:tm?`${tm.color}40`:'#e2e8f8'}}>
                  {m.role==='user'&&(
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:m.text?6:0}}>
                      {m.voiceInput&&<span style={{fontSize:11,background:'rgba(255,255,255,0.2)',padding:'2px 7px',borderRadius:10,color:'rgba(255,255,255,0.9)'}}>🎤 Voice</span>}
                    </div>
                  )}
                  {tm&&(
                    <div style={{display:'inline-flex',alignItems:'center',gap:6,marginBottom:8,padding:'4px 10px',background:tm.bg,borderRadius:8}}>
                      <span style={{fontSize:14}}>{tm.icon}</span>
                      <span style={{color:tm.color,fontSize:11,fontWeight:700}}>{tm.label} Report</span>
                    </div>
                  )}
                  <pre style={{...S.pre,color:m.role==='user'?'#fff':'#374151'}}>{m.text}</pre>
                  {m.quickPicks&&(
                    <div style={{display:'flex',flexWrap:'wrap',gap:7,marginTop:10}}>
                      {m.quickPicks.map(qp=>(
                        <button key={qp.label}
                          style={{
                            background:qp.bg, border:`1.5px solid ${qp.color}40`,
                            color:qp.color, borderRadius:20, padding:'6px 14px',
                            fontSize:12, cursor:'pointer', fontWeight:700,
                            transition:'all 0.18s', fontFamily:"'Plus Jakarta Sans',sans-serif",
                          }}
                          onMouseEnter={e=>{e.target.style.transform='translateY(-2px)';e.target.style.boxShadow=`0 4px 12px ${qp.color}30`;}}
                          onMouseLeave={e=>{e.target.style.transform='none';e.target.style.boxShadow='none';}}
                          onClick={()=>send(qp.query)}
                        >{qp.label}</button>
                      ))}
                    </div>
                  )}
                  {m.action?.type==='emailForm' && (
                    <div style={{marginTop:12}}>
                      {emailForm.sent && emailForm.msgIdx===i ? (
                        <div style={{background:'#f0fdf4',border:'1px solid #a7f3d0',borderRadius:8,padding:'10px 14px',color:'#065f46',fontSize:13,fontWeight:600}}>
                          {emailForm.sentMode==='now'
                            ? `✅ Report sent now to ${emailForm.email}!`
                            : `✅ Scheduled! Report will be delivered ${emailForm.sentFreq==='daily'?'every day':emailForm.sentFreq==='weekly'?'every week':'every month'} to ${emailForm.email}`}
                        </div>
                      ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:10}}>
                          {/* Email input */}
                          <input
                            type="email"
                            placeholder="Enter email address..."
                            value={emailForm.msgIdx===i ? emailForm.email : ''}
                            onChange={e=>setEmailForm(f=>({...f,email:e.target.value,msgIdx:i}))}
                            onFocus={()=>setEmailForm(f=>({...f,msgIdx:i}))}
                            style={{background:'#f8faff',border:'1.5px solid #bfdbfe',borderRadius:8,padding:'9px 12px',fontSize:13,color:'#1e2d4a',outline:'none',fontFamily:"'Plus Jakarta Sans',sans-serif",width:'100%'}}
                          />
                          {/* Two option cards */}
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                            {/* Send Now */}
                            <button
                              disabled={emailForm.sending}
                              onClick={async()=>{
                                const email = emailForm.msgIdx===i ? emailForm.email : '';
                                if(!email||!email.includes('@')){ alert('Please enter a valid email address.'); return; }
                                setEmailForm(f=>({...f,sending:true,msgIdx:i}));
                                try {
                                  // Schedule with nextRun = now so cron fires immediately
                                  await axios.post(`${API}/reports/schedule`,{
                                    reportType: m.action.reportType||'attendance',
                                    frequency:  'daily',
                                    email,
                                    label:      'Chatbot instant report',
                                  });
                                  setEmailForm(f=>({...f,sending:false,sent:true,sentMode:'now',msgIdx:i}));
                                } catch(e){
                                  alert('Failed: '+(e.response?.data?.message||e.message));
                                  setEmailForm(f=>({...f,sending:false}));
                                }
                              }}
                              style={{
                                background:'linear-gradient(135deg,#2563eb,#4f46e5)',
                                color:'#fff',border:'none',borderRadius:10,padding:'12px 10px',
                                fontSize:13,fontWeight:700,cursor:emailForm.sending?'default':'pointer',
                                fontFamily:"'Plus Jakarta Sans',sans-serif",
                                display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                                opacity:emailForm.sending?0.7:1,
                              }}
                            >
                              <span style={{fontSize:20}}>📤</span>
                              <span>{emailForm.sending?'Sending…':'Send Now'}</span>
                              <span style={{fontSize:10,opacity:0.8,fontWeight:400}}>One-time instant delivery</span>
                            </button>

                            {/* Schedule */}
                            <button
                              disabled={emailForm.sending}
                              onClick={()=>setEmailForm(f=>({...f,showSchedule:!f.showSchedule,msgIdx:i}))}
                              style={{
                                background: emailForm.showSchedule&&emailForm.msgIdx===i
                                  ? 'linear-gradient(135deg,#7c3aed,#4f46e5)'
                                  : '#f5f3ff',
                                color: emailForm.showSchedule&&emailForm.msgIdx===i ? '#fff' : '#7c3aed',
                                border:`1.5px solid #ddd6fe`,borderRadius:10,padding:'12px 10px',
                                fontSize:13,fontWeight:700,cursor:'pointer',
                                fontFamily:"'Plus Jakarta Sans',sans-serif",
                                display:'flex',flexDirection:'column',alignItems:'center',gap:4,
                              }}
                            >
                              <span style={{fontSize:20}}>📅</span>
                              <span>Schedule</span>
                              <span style={{fontSize:10,opacity:0.8,fontWeight:400}}>Recurring delivery</span>
                            </button>
                          </div>

                          {/* Schedule options — shown when Schedule button clicked */}
                          {emailForm.showSchedule && emailForm.msgIdx===i && (
                            <div style={{background:'#f5f3ff',border:'1px solid #ddd6fe',borderRadius:10,padding:'12px 14px',display:'flex',flexDirection:'column',gap:10}}>
                              <div style={{color:'#7c3aed',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.8px'}}>Choose Frequency</div>
                              <div style={{display:'flex',gap:8}}>
                                {[
                                  {v:'daily',  label:'Daily',   icon:'📅', desc:'Every day 8 AM'},
                                  {v:'weekly', label:'Weekly',  icon:'📆', desc:'Every Monday'},
                                  {v:'monthly',label:'Monthly', icon:'🗓', desc:'1st of month'},
                                ].map(f=>(
                                  <button key={f.v}
                                    onClick={()=>setEmailForm(ef=>({...ef,freq:f.v}))}
                                    style={{
                                      flex:1,border:`1.5px solid ${emailForm.freq===f.v?'#7c3aed':'#ddd6fe'}`,
                                      borderRadius:8,padding:'8px 6px',
                                      background:emailForm.freq===f.v?'#7c3aed':'#fff',
                                      color:emailForm.freq===f.v?'#fff':'#7c3aed',
                                      cursor:'pointer',fontFamily:"'Plus Jakarta Sans',sans-serif",
                                      display:'flex',flexDirection:'column',alignItems:'center',gap:2,
                                    }}
                                  >
                                    <span style={{fontSize:16}}>{f.icon}</span>
                                    <span style={{fontSize:12,fontWeight:700}}>{f.label}</span>
                                    <span style={{fontSize:9,opacity:0.8}}>{f.desc}</span>
                                  </button>
                                ))}
                              </div>
                              <button
                                disabled={emailForm.sending}
                                onClick={async()=>{
                                  const email = emailForm.msgIdx===i ? emailForm.email : '';
                                  const freq  = emailForm.freq || 'weekly';
                                  if(!email||!email.includes('@')){ alert('Please enter a valid email address.'); return; }
                                  setEmailForm(f=>({...f,sending:true}));
                                  try {
                                    await axios.post(`${API}/reports/schedule`,{
                                      reportType: m.action.reportType||'attendance',
                                      frequency:  freq,
                                      email,
                                      label: `Chatbot ${freq} report`,
                                    });
                                    setEmailForm(f=>({...f,sending:false,sent:true,sentMode:'schedule',sentFreq:freq,msgIdx:i}));
                                  } catch(e){
                                    alert('Failed: '+(e.response?.data?.message||e.message));
                                    setEmailForm(f=>({...f,sending:false}));
                                  }
                                }}
                                style={{
                                  background:'linear-gradient(135deg,#7c3aed,#4f46e5)',
                                  color:'#fff',border:'none',borderRadius:8,padding:'10px',
                                  fontSize:13,fontWeight:700,cursor:emailForm.sending?'default':'pointer',
                                  fontFamily:"'Plus Jakarta Sans',sans-serif",
                                  opacity:emailForm.sending?0.7:1,
                                }}
                              >
                                {emailForm.sending?'⟳ Saving…':`📅 Confirm ${(emailForm.freq||'weekly').charAt(0).toUpperCase()+(emailForm.freq||'weekly').slice(1)} Schedule`}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {m.data&&m.data.length>0&&<MiniTable data={m.data} type={m.type} subType={m.subType||''}/>}
                  {m.data&&m.data.length>0&&(
                    <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}>
                      {[
                        {fmt:'excel',label:'📊 Excel',color:'#10b981',bg:'#f0fdf4'},
                        {fmt:'csv',  label:'📄 CSV',  color:'#0ea5e9',bg:'#f0f9ff'},
                      ].map(b=>(
                        <button key={b.fmt}
                          style={{
                            background: hovB===`${i}${b.fmt}`?b.bg:'#f8faff',
                            border:`1.5px solid ${hovB===`${i}${b.fmt}`?b.color:'#e2e8f8'}`,
                            color: hovB===`${i}${b.fmt}`?b.color:'#64748b',
                            borderRadius:8,padding:'5px 12px',fontSize:11,cursor:'pointer',
                            transition:'all 0.2s',fontWeight:700,
                            transform: hovB===`${i}${b.fmt}`?'translateY(-1px)':'none',
                          }}
                          onClick={()=>doExport(b.fmt,m.data,m.type)}
                          onMouseEnter={()=>setHovB(`${i}${b.fmt}`)} onMouseLeave={()=>setHovB('')}
                        >{b.label}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{color:'#cbd5e1',fontSize:10,marginTop:4,textAlign:m.role==='user'?'right':'left',display:'flex',alignItems:'center',gap:4,justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                  {m.voiceInput&&<span style={{fontSize:10}}>🎤</span>}
                  {m.time?.toLocaleTimeString()}
                </div>
              </div>
              {m.role==='user'&&<div style={S.userAv}>👤</div>}
            </div>
          );
        })}
        {busy&&(
          <div style={{...S.row,justifyContent:'flex-start'}}>
            <div style={S.botAv}>🎓</div>
            <div style={S.botBubble}>
              <div style={{display:'flex',gap:5,padding:'4px 6px',alignItems:'center'}}>
                {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#3b82f6',animation:`bounce 1s ${i*0.15}s ease-in-out infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef}/>
      </div>

      {/* ── Voice status bar ── */}
      {(isListening || voiceStatus || voiceError || transcript) && (
        <div style={{
          padding:'10px 24px',
          background: isListening ? '#fff1f2' : voiceError ? '#fff1f2' : '#f0fdf4',
          borderTop:`2px solid ${isListening?'#ef4444':voiceError?'#fecdd3':'#a7f3d0'}`,
          display:'flex', alignItems:'center', gap:14, flexShrink:0,
          transition:'all 0.3s',
        }}>
          <VoiceWaveform isListening={isListening}/>
          <div style={{flex:1}}>
            {isListening && (
              <div style={{color:'#ef4444',fontSize:13,fontWeight:700,animation:'pulse 1s ease-in-out infinite'}}>
                🎤 Listening... Speak your report query clearly
              </div>
            )}
            {transcript && (
              <div style={{color:'#374151',fontSize:13,marginTop:isListening?4:0}}>
                <span style={{color:'#94a3b8',fontSize:11}}>Heard: </span>
                <span style={{fontWeight:600}}>"{transcript}"</span>
              </div>
            )}
            {voiceStatus && !isListening && (
              <div style={{color:'#10b981',fontSize:12,fontWeight:600}}>{voiceStatus}</div>
            )}
            {voiceError && (
              <div style={{color:'#ef4444',fontSize:12,fontWeight:600}}>{voiceError}</div>
            )}
          </div>
          {isListening && (
            <button onClick={toggleVoice}
              style={{background:'#fff1f2',border:'1.5px solid #fecdd3',color:'#ef4444',borderRadius:8,padding:'6px 14px',fontSize:12,cursor:'pointer',fontWeight:700}}>
              ■ Stop
            </button>
          )}
        </div>
      )}

      {/* ── Input bar ── */}
      <div style={S.inputRow}>

        {/* Mic button */}
        {voiceSupported ? (
          <button
            onClick={toggleVoice}
            title={isListening ? 'Stop listening' : 'Click to speak your query'}
            style={{
              width:48, height:48, borderRadius:12, border:'none', cursor:'pointer',
              transition:'all 0.25s', flexShrink:0,
              background: isListening
                ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                : 'linear-gradient(135deg,#f97316,#ea580c)',
              boxShadow: isListening
                ? '0 0 0 4px rgba(239,68,68,0.2), 0 4px 15px rgba(239,68,68,0.4)'
                : '0 4px 14px rgba(249,115,22,0.35)',
              transform: isListening ? 'scale(1.08)' : 'scale(1)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:20,
              position:'relative', overflow:'hidden',
            }}
          >
            {isListening ? (
              <>
                {/* Pulsing ring when active */}
                <div style={{
                  position:'absolute', inset:-4, borderRadius:16,
                  border:'2px solid rgba(239,68,68,0.4)',
                  animation:'pulse 1s ease-in-out infinite',
                }}/>
                <span style={{position:'relative',zIndex:1}}>⏹</span>
              </>
            ) : '🎤'}
          </button>
        ) : (
          <div title="Voice not supported in this browser"
            style={{width:48,height:48,borderRadius:12,background:'#f1f5f9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0,opacity:0.4}}>
            🎤
          </div>
        )}

        {/* Text input */}
        <div style={{flex:1,position:'relative'}}>
          <input
            style={{
              ...S.input,
              borderColor: isListening ? '#ef4444' : '#e2e8f8',
              boxShadow: isListening ? '0 0 0 3px rgba(239,68,68,0.1)' : 'none',
            }}
            value={inp}
            onChange={e=>setInp(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&send()}
            placeholder={isListening ? '🎤 Listening... speak now' : "Type or 🎤 speak: 'Show attendance for CSE section A'"}
          />
          {inp && (
            <button
              onClick={()=>{setInp('');setTranscript('');}}
              style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'#94a3b8',fontSize:16,lineHeight:1,padding:'2px'}}
            >✕</button>
          )}
        </div>

        {/* Send button */}
        <button
          onClick={()=>send()}
          disabled={!inp.trim()&&!busy}
          style={{
            background: inp.trim()
              ? hovB==='send'?'linear-gradient(135deg,#1d4ed8,#4f46e5)':'linear-gradient(135deg,#2563eb,#6366f1)'
              : '#e2e8f8',
            color: inp.trim() ? '#fff' : '#94a3b8',
            border:'none', borderRadius:12, padding:'12px 22px',
            fontSize:14, fontWeight:700, cursor:inp.trim()?'pointer':'default',
            transition:'all 0.25s',
            transform: hovB==='send'&&inp.trim()?'scale(1.04)':'none',
            boxShadow: hovB==='send'&&inp.trim()?'0 8px 25px rgba(37,99,235,0.4)':'none',
            flexShrink:0,
          }}
          onMouseEnter={()=>setHovB('send')} onMouseLeave={()=>setHovB('')}
        >
          Send ➤
        </button>
      </div>

      {/* Voice instructions tooltip (shown once) */}
      {voiceSupported && (
        <div style={{background:'#f8faff',borderTop:'1px solid #e2e8f8',padding:'7px 24px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{fontSize:13}}>💡</span>
          <span style={{color:'#64748b',fontSize:11}}>
            <strong>Voice tip:</strong> Click the orange 🎤 mic button and say your query clearly in English.
            Works best in Chrome/Edge. Say: <em>"Show attendance for CSE"</em> or <em>"Top 10 CGPA performers"</em>
          </span>
        </div>
      )}
      {!voiceSupported && (
        <div style={{background:'#fff7ed',borderTop:'1px solid #fed7aa',padding:'7px 24px',display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{fontSize:13}}>⚠️</span>
          <span style={{color:'#92400e',fontSize:11}}>
            Voice recognition requires Chrome or Edge browser. Currently using text input only.
          </span>
        </div>
      )}
    </div>
  );
}

const S = {
  page:      { display:'flex',flexDirection:'column',height:'100vh',background:'#f0f4ff',fontFamily:"'Plus Jakarta Sans',sans-serif" },
  head:      { position:'relative',height:110,overflow:'hidden',flexShrink:0 },
  headBg:    { width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 55%',filter:'brightness(0.45) saturate(1.2)' },
  headGrad:  { position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(15,23,60,0.92) 0%,rgba(37,99,235,0.35) 100%)' },
  headContent:{ position:'absolute',inset:0,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 24px' },
  headAv:    { width:44,height:44,borderRadius:12,background:'linear-gradient(135deg,#2563eb,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,boxShadow:'0 4px 15px rgba(37,99,235,0.4)',border:'2px solid rgba(255,255,255,0.25)' },
  headTitle: { fontFamily:"'Sora',sans-serif",fontSize:17,fontWeight:800,color:'#fff',margin:0 },
  headSub:   { color:'rgba(255,255,255,0.55)',fontSize:10,marginTop:3 },
  sugSection:{ padding:'10px 24px 10px',borderBottom:'1px solid #e2e8f8',background:'#fff',flexShrink:0 },
  chat:      { flex:1,overflowY:'auto',padding:'16px 24px',display:'flex',flexDirection:'column',gap:16 },
  row:       { display:'flex',gap:10,alignItems:'flex-start' },
  botAv:     { width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#eff6ff,#f5f3ff)',border:'1.5px solid #c7d2fe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0 },
  userAv:    { width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#dbeafe,#e0e7ff)',border:'1.5px solid #bfdbfe',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0 },
  botBubble: { background:'#fff',border:'1.5px solid',borderRadius:'0 14px 14px 14px',padding:'12px 16px',boxShadow:'0 2px 10px rgba(30,58,138,0.06)' },
  userBubble:{ background:'linear-gradient(135deg,#2563eb,#4f46e5)',borderRadius:'14px 0 14px 14px',padding:'12px 16px',boxShadow:'0 4px 15px rgba(37,99,235,0.25)' },
  pre:       { fontSize:13,margin:0,whiteSpace:'pre-wrap',lineHeight:1.65,fontFamily:"'Plus Jakarta Sans',sans-serif" },
  inputRow:  { display:'flex',gap:10,padding:'12px 24px 14px',borderTop:'1px solid #e2e8f8',background:'#fff',flexShrink:0,alignItems:'center' },
  input:     { width:'100%',background:'#f8faff',border:'1.5px solid',borderRadius:10,padding:'12px 36px 12px 16px',color:'#1e2d4a',fontSize:14,outline:'none',fontFamily:"'Plus Jakarta Sans',sans-serif",transition:'border-color 0.2s,box-shadow 0.2s' },
};