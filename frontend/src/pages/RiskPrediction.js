import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToCSV } from '../utils/exportUtils';

const RISK_COLOR = { HIGH:'#ef4444', MEDIUM:'#f97316', LOW:'#10b981' };
const RISK_BG    = { HIGH:'#fff1f2', MEDIUM:'#fff7ed', LOW:'#f0fdf4' };
const RISK_BORDER= { HIGH:'#fecdd3', MEDIUM:'#fed7aa', LOW:'#a7f3d0' };

function getSemesterOptions(batch, academicYear) {
  const all = [1, 2, 3, 4, 5, 6, 7, 8];
  if (!batch || !academicYear) return all;

  const batchMatch = String(batch).match(/^(\d{4})-(\d{4})$/);
  const yearMatch = String(academicYear).match(/^(\d{4})-(\d{4})$/);
  if (!batchMatch || !yearMatch) return all;

  const batchStart = Number(batchMatch[1]);
  const yearStart = Number(yearMatch[1]);
  const firstSemester = ((yearStart - batchStart) * 2) + 1;

  if (firstSemester < 1 || firstSemester > 8) return all;

  const options = [firstSemester];
  if (firstSemester + 1 <= 8) options.push(firstSemester + 1);
  return options;
}

function RiskBar({ value }) {
  const color = value >= 70 ? '#ef4444' : value >= 40 ? '#f97316' : '#10b981';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:8, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
        <div style={{
          width:`${value}%`, height:'100%', borderRadius:4,
          background: `linear-gradient(90deg, ${color}aa, ${color})`,
          transition:'width 0.6s ease',
        }}/>
      </div>
      <span style={{ fontSize:12, fontWeight:700, color, minWidth:34 }}>{value}%</span>
    </div>
  );
}

function InsightsPanel({ API, filters }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [open,    setOpen]    = useState(false);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const qp = new URLSearchParams(filters);
      const res = await axios.get(`${API}/ai/insights?${qp}`);
      setData(res.data);
      setOpen(true);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, [API, filters]);

  const TYPE_STYLE = {
    critical:{ bg:'#fff1f2', border:'#fecdd3', color:'#be123c', icon:'🔴' },
    warning: { bg:'#fffbeb', border:'#fde68a', color:'#b45309', icon:'🟡' },
    success: { bg:'#f0fdf4', border:'#a7f3d0', color:'#065f46', icon:'🟢' },
    info:    { bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8', icon:'🔵' },
  };

  return (
    <div style={{ marginBottom:20 }}>
      <button
        onClick={fetchInsights}
        disabled={loading}
        style={{
          background: loading ? '#94a3b8' : 'linear-gradient(135deg,#7c3aed,#4f46e5)',
          color:'#fff', border:'none', borderRadius:10, padding:'11px 24px',
          fontSize:14, fontWeight:700, cursor: loading ? 'default' : 'pointer',
          display:'flex', alignItems:'center', gap:8, transition:'all 0.25s',
          boxShadow:'0 4px 14px rgba(124,58,237,0.35)',
          fontFamily:"'Plus Jakarta Sans',sans-serif",
        }}
      >
        {loading
          ? <><span style={{animation:'spin 0.8s linear infinite',display:'inline-block'}}>⟳</span> Generating AI Insights...</>
          : <><span>🤖</span> Generate AI Insights</>}
      </button>

      {open && data && (
        <div style={{
          marginTop:16, background:'#fff', border:'1.5px solid #ddd6fe',
          borderRadius:16, padding:'20px 24px',
          boxShadow:'0 4px 20px rgba(124,58,237,0.08)',
        }}>
          {/* Narrative */}
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#7c3aed,#4f46e5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🤖</div>
            <div>
              <div style={{ color:'#7c3aed', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>AI Analysis</div>
              <p style={{ color:'#374151', fontSize:13, lineHeight:1.7, margin:0 }}>{data.narrative}</p>
            </div>
          </div>

          {/* Insights */}
          {data.insights?.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8, marginBottom:16 }}>
              {data.insights.map((ins, i) => {
                const ts = TYPE_STYLE[ins.type] || TYPE_STYLE.info;
                return (
                  <div key={i} style={{ background:ts.bg, border:`1px solid ${ts.border}`, borderRadius:8, padding:'8px 12px', display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:13, flexShrink:0, marginTop:1 }}>{ts.icon}</span>
                    <span style={{ color:ts.color, fontSize:12, fontWeight:600, lineHeight:1.5 }}>{ins.text}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommendations */}
          {data.recommendations?.length > 0 && (
            <div style={{ background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:10, padding:'12px 16px' }}>
              <div style={{ color:'#7c3aed', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1px', marginBottom:8 }}>Recommendations</div>
              {data.recommendations.map((r, i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom: i < data.recommendations.length-1 ? 6 : 0 }}>
                  <span style={{ color:'#7c3aed', fontWeight:800, fontSize:13, flexShrink:0 }}>{i+1}.</span>
                  <span style={{ color:'#4c1d95', fontSize:12, lineHeight:1.5 }}>{r}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={()=>setOpen(false)} style={{ marginTop:12, background:'none', border:'1px solid #ddd6fe', color:'#7c3aed', borderRadius:7, padding:'5px 12px', fontSize:11, cursor:'pointer', fontWeight:600 }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}

export default function RiskPrediction() {
  const { API, user } = useAuth();
  const [data,    setData]    = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched,setSearched]= useState(false);
  const [filters, setFilters] = useState({});
  const [meta,    setMeta]    = useState({ departments:[], batches:[], sections:[] });
  const [search,  setSearch]  = useState('');
  const [hov,     setHov]     = useState('');
  const [expanded,setExpanded]= useState(null);
  const semesterOptions = getSemesterOptions(filters.batch, filters.academicYear);

  useEffect(()=>{ axios.get(`${API}/students/meta`).then(r=>setMeta(r.data)).catch(()=>{}); },[API]);
  useEffect(() => {
    if (filters.semester && !semesterOptions.includes(parseInt(filters.semester, 10))) {
      setFilters(prev => ({ ...prev, semester: '' }));
    }
  }, [filters.semester, semesterOptions]);

  const fetchRisk = useCallback(async () => {
    setLoading(true); setSearched(true);
    try {
      const qp = new URLSearchParams();
      Object.entries(filters).forEach(([k,v])=>{ if(v) qp.append(k,v); });
      const res = await axios.get(`${API}/ai/predict-risk?${qp}`);
      setData(res.data.data || []);
      setSummary(res.data.summary || null);
    } catch(e) { console.error(e); setData([]); }
    setLoading(false);
  }, [API, filters]);

  const filtered = data.filter(s =>
    !search || [s.rollNumber,s.name,s.department,s.section].some(v=>String(v).toLowerCase().includes(search.toLowerCase()))
  );

  const doExport = fmt => {
    const rows = filtered.map(s => ({
      'Roll Number': s.rollNumber, 'Name': s.name,
      'Department': s.department, 'Section': s.section, 'Batch': s.batch,
      'CGPA': s.cgpa, 'Avg Attendance %': s.avgAttendance,
      'Backlogs': s.backlogCount, 'CGPA Trend': s.cgpaTrend,
      'Risk %': s.riskProbability, 'Risk Level': s.riskLevel,
      'Risk Factors': s.riskFactors?.join('; '),
    }));
    fmt==='excel' ? exportToExcel(rows,'risk_prediction') : exportToCSV(rows,'risk_prediction');
  };

  const ps = { color:'#f97316', g:'linear-gradient(135deg,#f97316,#ef4444)', bg:'#fff7ed', bd:'#fed7aa' };

  return (
    <div style={{ minHeight:'100vh', background:'#f0f4ff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>

      {/* Hero */}
      <div style={{ position:'relative', height:168, overflow:'hidden' }}>
        <img src="/campus/n_block.jpg" alt="campus"
          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 35%', filter:'brightness(0.48) saturate(1.2)' }}
          onError={e=>e.target.style.display='none'}/>
        <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg,rgba(10,20,55,0.93) 0%,rgba(249,115,22,0.15) 100%)' }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:ps.g, backgroundSize:'200% 100%', animation:'gradMove 3s ease infinite' }}/>
        <div style={{ position:'absolute', top:0, left:0, right:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(6px)', padding:'6px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ color:'rgba(255,255,255,0.6)', fontSize:10 }}>Vignan's Foundation for Science, Technology and Research (Deemed to be University)</span>
          <div style={{ display:'flex', gap:6 }}>
            {['NAAC A+','NBA','Autonomous'].map(b=>(
              <span key={b} style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.85)', fontSize:9, padding:'2px 8px', borderRadius:20, fontWeight:700 }}>{b}</span>
            ))}
          </div>
        </div>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', gap:18, padding:'36px 28px 0', zIndex:1 }}>
          <div style={{ width:62, height:62, borderRadius:16, background:ps.g, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:`0 8px 25px rgba(249,115,22,0.5)`, border:'2px solid rgba(255,255,255,0.25)', flexShrink:0 }}>
            🤖
          </div>
          <div>
            <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:800, color:'#fff', margin:0 }}>AI Risk Prediction</h2>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:12, marginTop:5 }}>Multi-factor weighted model — predicts academic failure probability per student</p>
          </div>
        </div>
      </div>

      <div style={{ padding:'22px 28px 32px' }}>

        {/* Insights Panel */}
        <InsightsPanel API={API} filters={filters} />

        {/* Filter Panel */}
        <div style={{ background:'#fff', border:`1.5px solid ${ps.bd}`, borderRadius:16, padding:'18px 22px 22px', marginBottom:20, boxShadow:`0 4px 20px rgba(249,115,22,0.08)` }}>
          <div style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1.2px', marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:6, height:6, borderRadius:'50%', background:ps.color, display:'inline-block' }}/>
            Configure Prediction Filters
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14, marginBottom:18 }}>
            {user?.role==='admin' && (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <label style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px' }}>Department</label>
                <select style={selStyle(ps.color)} value={filters.department||''} onChange={e=>setFilters({...filters,department:e.target.value})}>
                  <option value="">All Departments</option>
                  {meta.departments.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px' }}>Batch</label>
              <select style={selStyle(ps.color)} value={filters.batch||''} onChange={e=>setFilters({...filters,batch:e.target.value})}>
                <option value="">All Batches</option>
                {meta.batches.map(b=><option key={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px' }}>Section</label>
              <select style={selStyle(ps.color)} value={filters.section||''} onChange={e=>setFilters({...filters,section:e.target.value})}>
                <option value="">All Sections</option>
                {meta.sections.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px' }}>Academic Year</label>
              <select style={selStyle(ps.color)} value={filters.academicYear||''} onChange={e=>setFilters({...filters,academicYear:e.target.value})}>
                <option value="">All Years</option>
                {['2021-2022','2022-2023','2023-2024','2024-2025','2025-2026'].map(y=>(
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <label style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px' }}>Semester</label>
              <select style={selStyle(ps.color)} value={filters.semester||''} onChange={e=>setFilters({...filters,semester:e.target.value})}>
                <option value="">All Semesters</option>
                {semesterOptions.map(s=><option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
          </div>

          <button
            style={{
              background: hov==='run' ? ps.g : `linear-gradient(135deg,${ps.color},${ps.color}cc)`,
              color:'#fff', border:'none', borderRadius:10, padding:'11px 28px',
              fontSize:14, fontWeight:700, cursor:'pointer', transition:'all 0.25s',
              fontFamily:"'Plus Jakarta Sans',sans-serif",
              transform: hov==='run' ? 'translateY(-3px)' : 'none',
              boxShadow: hov==='run' ? `0 10px 30px rgba(249,115,22,0.45)` : `0 4px 14px rgba(249,115,22,0.3)`,
            }}
            onClick={fetchRisk} disabled={loading}
            onMouseEnter={()=>setHov('run')} onMouseLeave={()=>setHov('')}
          >
            {loading
              ? <span style={{display:'inline-block',animation:'spin 0.8s linear infinite'}}>⟳  Running Prediction...</span>
              : '🤖  Run AI Risk Prediction →'}
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
            {[
              { label:'Total Analysed',   value:summary.total,        color:'#2563eb', bg:'#eff6ff', icon:'👥' },
              { label:'High Risk',         value:summary.high,         color:'#ef4444', bg:'#fff1f2', icon:'🔴' },
              { label:'Medium Risk',       value:summary.medium,       color:'#f97316', bg:'#fff7ed', icon:'🟡' },
              { label:'Avg Risk Score',    value:summary.avgRiskScore+'%', color:'#8b5cf6', bg:'#f5f3ff', icon:'📊' },
            ].map(c=>(
              <div key={c.label} style={{ background:'#fff', border:`1.5px solid ${c.color}20`, borderRadius:14, padding:'16px 18px', boxShadow:`0 2px 10px ${c.color}10` }}>
                <div style={{ fontSize:24, marginBottom:8 }}>{c.icon}</div>
                <div style={{ fontFamily:"'Sora',sans-serif", fontSize:28, fontWeight:800, color:c.color }}>{c.value}</div>
                <div style={{ fontSize:12, color:'#94a3b8', marginTop:4, fontWeight:600 }}>{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Results Table */}
        {searched && (
          <div style={{ background:'#fff', border:'1.5px solid #e2e8f8', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 20px rgba(30,58,138,0.06)' }}>
            {/* Toolbar */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom:`2px solid ${ps.bd}`, background:ps.bg, flexWrap:'wrap', gap:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ background:ps.g, color:'#fff', padding:'4px 16px', borderRadius:20, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif" }}>
                  {filtered.length}
                </div>
                <span style={{ color:'#374151', fontWeight:600, fontSize:13 }}>students analysed</span>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:13 }}>🔍</span>
                  <input
                    style={{ background:'#f8faff', border:'1.5px solid #e2e8f8', borderRadius:8, padding:'7px 12px 7px 32px', color:'#1e2d4a', fontSize:13, outline:'none', width:200 }}
                    placeholder="Search students..." value={search} onChange={e=>setSearch(e.target.value)}
                  />
                </div>
                {[
                  { fmt:'excel', label:'📊 Excel', c:'#10b981', bg:'#f0fdf4' },
                  { fmt:'csv',   label:'📄 CSV',   c:'#0ea5e9', bg:'#f0f9ff' },
                ].map(b=>(
                  <button key={b.fmt}
                    style={{ background: hov===b.fmt ? b.bg : '#f8faff', border:`1.5px solid ${hov===b.fmt?b.c:'#e2e8f8'}`, color: hov===b.fmt?b.c:'#64748b', borderRadius:8, padding:'7px 12px', fontSize:12, cursor:'pointer', transition:'all 0.2s', fontWeight:700 }}
                    onClick={()=>doExport(b.fmt)}
                    onMouseEnter={()=>setHov(b.fmt)} onMouseLeave={()=>setHov('')}
                  >{b.label}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'55px 0', gap:14 }}>
                <div style={{ width:40, height:40, border:`3px solid rgba(249,115,22,0.2)`, borderTop:`3px solid #f97316`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                <div style={{ color:'#f97316', fontSize:13, fontWeight:600 }}>Running AI risk model...</div>
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0', color:'#94a3b8' }}>
                <div style={{ fontSize:48, marginBottom:12 }}>😕</div>
                <div style={{ fontSize:15, fontWeight:600 }}>No results — run the prediction first</div>
              </div>
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8faff' }}>
                      {['#','Roll Number','Name','Dept','CGPA','Avg Att %','Backlogs','Trend','Risk Score','Level','Factors'].map(h=>(
                        <th key={h} style={{ color:ps.color, padding:'10px 14px', textAlign:'left', fontWeight:800, fontSize:10, textTransform:'uppercase', letterSpacing:'0.8px', whiteSpace:'nowrap', borderBottom:`2px solid ${ps.bd}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,100).map((s,i)=>{
                      const rc = RISK_COLOR[s.riskLevel];
                      const rb = RISK_BG[s.riskLevel];
                      const rbd= RISK_BORDER[s.riskLevel];
                      const isExp = expanded === s.rollNumber;
                      return (
                        <React.Fragment key={s.rollNumber}>
                          <tr
                            style={{ background: i%2===0?'#fafbff':'#fff', borderLeft:`3px solid ${rc}`, cursor:'pointer', transition:'background 0.15s' }}
                            onClick={()=>setExpanded(isExp ? null : s.rollNumber)}
                          >
                            <td style={{ color:'#94a3b8', padding:'10px 14px', borderBottom:'1px solid #f1f5f9', fontSize:12 }}>{i+1}</td>
                            <td style={{ color:'#1e2d4a', padding:'10px 14px', borderBottom:'1px solid #f1f5f9', fontWeight:700, fontFamily:"'Sora',sans-serif", fontSize:12 }}>{s.rollNumber}</td>
                            <td style={{ color:'#374151', padding:'10px 14px', borderBottom:'1px solid #f1f5f9', whiteSpace:'nowrap' }}>{s.name}</td>
                            <td style={{ color:'#64748b', padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }}>{s.department}</td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }}>
                              <span style={{ color: s.cgpa<6?'#ef4444':s.cgpa<7?'#f97316':'#10b981', fontWeight:700, background: s.cgpa<6?'#fff1f2':s.cgpa<7?'#fff7ed':'#f0fdf4', padding:'2px 7px', borderRadius:5 }}>{s.cgpa}</span>
                            </td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }}>
                              <span style={{ color: s.avgAttendance<65?'#ef4444':s.avgAttendance<75?'#f97316':'#10b981', fontWeight:700 }}>{s.avgAttendance}%</span>
                            </td>
                            <td style={{ color: s.backlogCount>0?'#ef4444':'#10b981', padding:'10px 14px', borderBottom:'1px solid #f1f5f9', fontWeight:700 }}>{s.backlogCount}</td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }}>
                              <span style={{ color: s.cgpaTrend == null ? '#94a3b8' : s.cgpaTrend < 0 ? '#ef4444' : '#10b981', fontWeight:700 }}>
                                {s.cgpaTrend == null ? '—' : `${s.cgpaTrend > 0 ? '+' : ''}${s.cgpaTrend}`}
                              </span>
                            </td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', minWidth:120 }}>
                              <RiskBar value={s.riskProbability} />
                            </td>
                            <td style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9' }}>
                              <span style={{ background:rb, border:`1px solid ${rbd}`, color:rc, fontSize:11, padding:'3px 10px', borderRadius:20, fontWeight:800 }}>{s.riskLevel}</span>
                            </td>
                            <td style={{ color:'#94a3b8', padding:'10px 14px', borderBottom:'1px solid #f1f5f9', fontSize:11 }}>
                              {isExp ? '▲ Hide' : `${s.riskFactors?.length||0} factor(s) ▼`}
                            </td>
                          </tr>
                          {isExp && (
                            <tr>
                              <td colSpan={11} style={{ background:rb, borderBottom:'1px solid #f1f5f9', padding:'12px 20px 14px' }}>
                                <div style={{ fontSize:12, color:'#374151', fontWeight:600, marginBottom:8 }}>Risk Factors:</div>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                  {s.riskFactors?.length ? s.riskFactors.map((f,fi)=>(
                                    <span key={fi} style={{ background:'#fff', border:`1px solid ${rbd}`, color:rc, fontSize:11, padding:'3px 10px', borderRadius:6, fontWeight:600 }}>{f}</span>
                                  )) : <span style={{ color:'#10b981' }}>No significant risk factors detected.</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {filtered.length > 100 && (
                  <div style={{ color:'#94a3b8', fontSize:12, padding:'12px 20px', textAlign:'center', borderTop:'1px solid #f1f5f9', background:'#fafbff' }}>
                    Showing 100 of {filtered.length} — export to view all
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const selStyle = c => ({
  background:'#f8faff', border:`1.5px solid ${c}30`, borderRadius:8,
  padding:'9px 12px', color:'#1e2d4a', fontSize:13, outline:'none',
  width:'100%', fontFamily:"'Plus Jakarta Sans',sans-serif", cursor:'pointer',
});
