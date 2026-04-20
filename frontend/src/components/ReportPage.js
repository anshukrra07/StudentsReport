import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToCSV, flattenForExport } from '../utils/exportUtils';

// Only 2 clear campus photos
const PAGE_PHOTO = {
  attendance:'/campus/n_block.jpg',
  marks:     '/campus/h_block_new.jpg',
  backlogs:  '/campus/u_block_new.jpg',
  cgpa:      '/campus/all.jpg',
  risk:      '/campus/n_block.jpg',
  toppers:   '/campus/h_block_new.jpg',
};
const PAGE_STYLE = {
  attendance:{ color:'#0ea5e9', g:'linear-gradient(135deg,#0ea5e9,#2563eb)', bg:'#f0f9ff', bd:'#bae6fd' },
  marks:     { color:'#f59e0b', g:'linear-gradient(135deg,#f59e0b,#f97316)', bg:'#fffbeb', bd:'#fde68a' },
  backlogs:  { color:'#ef4444', g:'linear-gradient(135deg,#ef4444,#f97316)', bg:'#fff1f2', bd:'#fecdd3' },
  cgpa:      { color:'#8b5cf6', g:'linear-gradient(135deg,#8b5cf6,#4f46e5)', bg:'#f5f3ff', bd:'#ddd6fe' },
  risk:      { color:'#f97316', g:'linear-gradient(135deg,#f97316,#ef4444)', bg:'#fff7ed', bd:'#fed7aa' },
  toppers:   { color:'#10b981', g:'linear-gradient(135deg,#10b981,#0ea5e9)', bg:'#f0fdf4', bd:'#a7f3d0' },
};

function getSemesterOptions(batch, academicYear) {
  const all = [1,2,3,4,5,6,7,8];
  if (!batch || !academicYear) return all;
  const batchMatch = String(batch).match(/^(\d{4})-(\d{4})$/);
  const yearMatch = String(academicYear).match(/^(\d{4})-(\d{4})$/);
  if (!batchMatch || !yearMatch) return all;
  const batchStart = Number(batchMatch[1]);
  const yearStart = Number(yearMatch[1]);
  const offsetYears = yearStart - batchStart;
  const firstSemester = (offsetYears * 2) + 1;
  if (firstSemester < 1 || firstSemester > 8) return all;
  const options = [firstSemester];
  if (firstSemester + 1 <= 8) options.push(firstSemester + 1);
  return options;
}

export default function ReportPage({ reportType, title, icon, description, filterConfig, columns, columnSets }) {
  const { API, user } = useAuth();
  const [filters, setFilters]   = useState({});
  const [data, setData]         = useState([]);
  const [meta, setMeta]         = useState({ departments:[], batches:[], sections:[] });
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [search, setSearch]     = useState('');
  const [hovRow, setHovRow]     = useState(null);
  const [hovBtn, setHovBtn]     = useState('');
  const [activeType, setActiveType] = useState('');

  const ps = PAGE_STYLE[reportType] || PAGE_STYLE.attendance;
  const semesterOptions = getSemesterOptions(filters.batch, filters.academicYear);

  useEffect(() => {
    if (filters.semester && !semesterOptions.includes(parseInt(filters.semester, 10))) {
      setFilters(prev => ({ ...prev, semester: '' }));
    }
  }, [filters.semester, semesterOptions]);

  useEffect(()=>{ axios.get(`${API}/students/meta`).then(r=>setMeta(r.data)).catch(()=>{}); },[API]);

  // Select correct column set for current sub-type
  const activeColumns = (columnSets && columnSets[activeType]) ? columnSets[activeType] : columns;

  const fetchReport = useCallback(async () => {
    setLoading(true); setSearched(true);
    setActiveType(filters.type || '');
    try {
      // Build endpoint
      let ep = '';
      const qp = new URLSearchParams();
      // Add all filters EXCEPT type (type goes into URL directly per route)
      Object.entries(filters).forEach(([k,v]) => {
        if(v && k !== 'type') qp.append(k, v);
      });

      switch(reportType) {
        case 'attendance':
          ep = `/reports/attendance?type=${filters.type||'section_wise'}&${qp}`;
          break;
        case 'marks':
          ep = `/reports/marks?type=${filters.type||'external'}&${qp}`;
          break;
        case 'backlogs':
          // backlogs uses 'subtype' not 'type'; academicYear and other filters pass via qp
          ep = `/reports/backlogs?subtype=${filters.type||''}&${qp}`;
          break;
        case 'cgpa':
          ep = `/reports/cgpa?type=${filters.type||'ranking'}&${qp}`;
          break;
        case 'risk':
          ep = `/reports/risk?riskType=${filters.type||''}&${qp}`;
          break;
        case 'toppers':
          ep = `/reports/top-performers?limit=${filters.limit||10}&${qp}`;
          break;
        default:
          ep = `/reports/${reportType}?${qp}`;
      }

      const res = await axios.get(`${API}${ep}`);
      const raw = res.data;
      const rows = raw.data || raw.distribution || [];
      setData(Array.isArray(rows) ? rows : []);
    } catch(e){ console.error('Report error:', e); setData([]); }
    setLoading(false);
  }, [API, filters, reportType]);

  const filtered = data.filter(row =>
    !search || Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );

  const doExport = fmt => {
    const flat = flattenForExport(filtered, reportType);
    fmt==='excel'
      ? exportToExcel(flat, `${reportType}_${activeType||'report'}`)
      : exportToCSV(flat, `${reportType}_${activeType||'report'}`);
  };

  const doPDF = () => {
    const qp = new URLSearchParams({ reportType, title, ...filters });
    window.open(`${API}/reports/export-pdf?${qp}`, '_blank');
  };

  const selTypes = filterConfig?.types || [];

  return (
    <div style={{minHeight:'100vh', background:'#f0f4ff', fontFamily:"'Plus Jakarta Sans',sans-serif"}}>

      {/* ── Hero banner with campus photo ── */}
      <div style={{position:'relative', height:168, overflow:'hidden'}}>
        <img src={PAGE_PHOTO[reportType]} alt="campus"
          style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 35%',filter:'brightness(0.48) saturate(1.2)'}}
          onError={e=>e.target.style.display='none'}/>
        <div style={{position:'absolute',inset:0,background:`linear-gradient(90deg,rgba(10,20,55,0.93) 0%,${ps.color}22 100%)`}}/>
        {/* Animated bottom color bar */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:4,background:ps.g,backgroundSize:'200% 100%',animation:'gradMove 3s ease infinite'}}/>
        {/* Top strip — university name */}
        <div style={{position:'absolute',top:0,left:0,right:0,background:'rgba(0,0,0,0.3)',backdropFilter:'blur(6px)',padding:'6px 28px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontFamily:"'Sora',sans-serif",color:'#fff',fontWeight:800,fontSize:11,letterSpacing:'1px'}}>VFSTR</span>
            <span style={{color:'rgba(255,255,255,0.25)',fontSize:10}}>|</span>
            <span style={{color:'rgba(255,255,255,0.55)',fontSize:10}}>Vignan's Foundation for Science, Technology and Research (Deemed to be University)</span>
          </div>
          <div style={{display:'flex',gap:6}}>
            {['NAAC A+','NBA','Autonomous'].map(b=>(
              <span key={b} style={{background:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.2)',color:'rgba(255,255,255,0.85)',fontSize:9,padding:'2px 8px',borderRadius:20,fontWeight:700}}>{b}</span>
            ))}
          </div>
        </div>
        {/* Report title */}
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',gap:18,padding:'36px 28px 0',zIndex:1}}>
          <div style={{width:62,height:62,borderRadius:16,background:ps.g,display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,boxShadow:`0 8px 25px ${ps.color}55`,border:'2px solid rgba(255,255,255,0.25)',flexShrink:0}}>
            {icon}
          </div>
          <div>
            <h2 style={{fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,color:'#fff',margin:0}}>{title}</h2>
            <p style={{color:'rgba(255,255,255,0.55)',fontSize:12,marginTop:5}}>{description}</p>
          </div>
        </div>
      </div>

      <div style={{padding:'22px 28px 32px'}}>

        {/* ── Filter panel ── */}
        <div style={{background:'#fff',border:`1.5px solid ${ps.bd}`,borderRadius:16,padding:'18px 22px 22px',marginBottom:20,boxShadow:`0 4px 20px ${ps.color}10`}}>
          <div style={{color:ps.color,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'1.2px',marginBottom:16,display:'flex',alignItems:'center',gap:8}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:ps.color,display:'inline-block'}}/>
            Configure Report Filters
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(168px,1fr))',gap:14,marginBottom:18}}>
            {user?.role==='admin' && (
              <Sel label="Department" value={filters.department||''} color={ps.color} onChange={v=>setFilters({...filters,department:v})}>
                <option value="">All Departments</option>
                {meta.departments.map(d=><option key={d}>{d}</option>)}
              </Sel>
            )}
            <Sel label="Batch" value={filters.batch||''} color={ps.color} onChange={v=>setFilters({...filters,batch:v})}>
              <option value="">All Batches</option>
              {meta.batches.map(b=><option key={b}>{b}</option>)}
            </Sel>
            <Sel label="Section" value={filters.section||''} color={ps.color} onChange={v=>setFilters({...filters,section:v})}>
              <option value="">All Sections</option>
              {meta.sections.map(s=><option key={s}>{s}</option>)}
            </Sel>
            <Sel label="Semester" value={filters.semester||''} color={ps.color} onChange={v=>setFilters({...filters,semester:v})}>
              <option value="">All Semesters</option>
              {semesterOptions.map(s=><option key={s} value={s}>Semester {s}</option>)}
            </Sel>
            {filterConfig?.showType && selTypes.length>0 && (
              <Sel label="Report Type" value={filters.type||''} color={ps.color} onChange={v=>setFilters({...filters,type:v})}>
                <option value="">Select Type</option>
                {selTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
              </Sel>
            )}
            {filterConfig?.showThreshold && (
              <InputField label="Threshold %" color={ps.color} type="number" min="0" max="100" placeholder="75 (default)"
                value={filters.threshold||''} onChange={v=>setFilters({...filters,threshold:v})}/>
            )}
            {filterConfig?.showLimit && (
              <InputField label="Top N Students" color={ps.color} type="number" min="1" max="200" placeholder="10 (default)"
                value={filters.limit||''} onChange={v=>setFilters({...filters,limit:v})}/>
            )}
            {filterConfig?.showAcademicYear && (
              <Sel label="Academic Year" value={filters.academicYear||''} color={ps.color} onChange={v=>setFilters({...filters,academicYear:v})}>
                <option value="">All Years</option>
                {['2021-2022','2022-2023','2023-2024','2024-2025','2025-2026'].map(y=>(
                  <option key={y} value={y}>{y}</option>
                ))}
              </Sel>
            )}
          </div>

          <button
            style={{
              background: hovBtn==='gen' ? ps.g : `linear-gradient(135deg,${ps.color},${ps.color}cc)`,
              color:'#fff', border:'none', borderRadius:10, padding:'11px 28px',
              fontSize:14, fontWeight:700, cursor:'pointer', transition:'all 0.25s',
              fontFamily:"'Plus Jakarta Sans',sans-serif",
              transform: hovBtn==='gen' ? 'translateY(-3px)' : 'none',
              boxShadow: hovBtn==='gen' ? `0 10px 30px ${ps.color}55` : `0 4px 14px ${ps.color}30`,
            }}
            onClick={fetchReport} disabled={loading}
            onMouseEnter={()=>setHovBtn('gen')} onMouseLeave={()=>setHovBtn('')}
          >
            {loading
              ? <span style={{display:'inline-block',animation:'spin 0.8s linear infinite'}}>⟳  Generating...</span>
              : `Generate ${title} →`
            }
          </button>
        </div>

        {/* ── Results table ── */}
        {searched && (
          <div style={{background:'#fff',border:'1.5px solid #e2e8f8',borderRadius:16,overflow:'hidden',boxShadow:'0 4px 20px rgba(30,58,138,0.06)'}}>
            {/* Toolbar */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 20px',borderBottom:`2px solid ${ps.bd}`,background:ps.bg}}>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{background:ps.g,color:'#fff',padding:'4px 16px',borderRadius:20,fontSize:16,fontWeight:800,fontFamily:"'Sora',sans-serif",boxShadow:`0 4px 12px ${ps.color}30`,minWidth:40,textAlign:'center'}}>
                  {filtered.length}
                </div>
                <div>
                  <span style={{color:'#374151',fontWeight:600,fontSize:13}}>records found</span>
                  {activeType && (
                    <span style={{marginLeft:8,color:ps.color,fontSize:11,fontWeight:700,background:ps.bg,border:`1px solid ${ps.bd}`,padding:'2px 8px',borderRadius:20}}>
                      {selTypes.find(t=>t.value===activeType)?.label || activeType.replace(/_/g,' ')}
                    </span>
                  )}
                </div>
              </div>
              <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{position:'relative'}}>
                  <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'#94a3b8',fontSize:13}}>🔍</span>
                  <input
                    style={{background:'#f8faff',border:'1.5px solid #e2e8f8',borderRadius:8,padding:'7px 12px 7px 32px',color:'#1e2d4a',fontSize:13,outline:'none',width:200,fontFamily:"'Plus Jakarta Sans',sans-serif"}}
                    placeholder="Search records..." value={search} onChange={e=>setSearch(e.target.value)}
                  />
                </div>
                {[
                  {fmt:'excel',label:'📊 Excel',c:'#10b981',bg:'#f0fdf4',bd:'#a7f3d0'},
                  {fmt:'csv',  label:'📄 CSV',  c:'#0ea5e9',bg:'#f0f9ff',bd:'#bae6fd'},
                  {fmt:'pdf',  label:'📕 PDF',  c:'#ef4444',bg:'#fff1f2',bd:'#fecdd3'},
                ].map(b=>(
                  <button key={b.fmt}
                    style={{
                      background: hovBtn===b.fmt ? b.bg : '#f8faff',
                      border:`1.5px solid ${hovBtn===b.fmt?b.bd:'#e2e8f8'}`,
                      color: hovBtn===b.fmt ? b.c : '#64748b',
                      borderRadius:8,padding:'7px 12px',fontSize:12,cursor:'pointer',
                      transition:'all 0.2s',fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",
                      transform: hovBtn===b.fmt ? 'translateY(-2px)' : 'none',
                      boxShadow: hovBtn===b.fmt ? `0 4px 12px ${b.c}25` : 'none',
                    }}
                    onClick={()=>b.fmt==='pdf'?doPDF():doExport(b.fmt)}
                    onMouseEnter={()=>setHovBtn(b.fmt)} onMouseLeave={()=>setHovBtn('')}
                  >{b.label}</button>
                ))}
              </div>
            </div>

            {/* Table content */}
            {loading ? (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'55px 0',gap:14}}>
                <div style={{width:40,height:40,border:`3px solid ${ps.color}25`,borderTop:`3px solid ${ps.color}`,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                <div style={{color:ps.color,fontSize:13,fontWeight:600}}>Fetching data from database...</div>
              </div>
            ) : filtered.length===0 ? (
              <div style={{textAlign:'center',padding:'60px 0',color:'#94a3b8'}}>
                <div style={{fontSize:48,marginBottom:12}}>😕</div>
                <div style={{fontSize:15,fontWeight:600}}>No records found</div>
                <div style={{fontSize:13,marginTop:6}}>Try adjusting your filters and generate again</div>
              </div>
            ) : (
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#f8faff'}}>
                      <th style={{color:ps.color,padding:'10px 14px',textAlign:'left',fontWeight:800,fontSize:10,textTransform:'uppercase',letterSpacing:'0.8px',whiteSpace:'nowrap',borderBottom:`2px solid ${ps.bd}`,width:50}}>#</th>
                      {activeColumns.map(c=>(
                        <th key={c.key} style={{color:ps.color,padding:'10px 14px',textAlign:'left',fontWeight:800,fontSize:10,textTransform:'uppercase',letterSpacing:'0.8px',whiteSpace:'nowrap',borderBottom:`2px solid ${ps.bd}`}}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,100).map((row,i)=>(
                      <tr key={i}
                        style={{
                          background: hovRow===i ? ps.bg : i%2===0 ? '#fafbff' : '#fff',
                          borderLeft:`3px solid ${hovRow===i?ps.color:'transparent'}`,
                          transition:'all 0.15s', cursor:'default',
                        }}
                        onMouseEnter={()=>setHovRow(i)} onMouseLeave={()=>setHovRow(null)}
                      >
                        <td style={{color:'#94a3b8',padding:'10px 14px',fontSize:12,borderBottom:'1px solid #f1f5f9'}}>{i+1}</td>
                        {activeColumns.map(c=>(
                          <td key={c.key} style={{color:'#374151',padding:'10px 14px',whiteSpace:'nowrap',borderBottom:'1px solid #f1f5f9'}}>
                            {c.render
                              ? c.render(row)
                              : Array.isArray(row[c.key])
                                ? row[c.key].join(', ')
                                : (row[c.key] !== undefined && row[c.key] !== null && String(row[c.key]) !== '')
                                  ? String(row[c.key])
                                  : <span style={{color:'#e2e8f0',fontSize:11}}>—</span>
                            }
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length>100 && (
                  <div style={{color:'#94a3b8',fontSize:12,padding:'12px 20px',textAlign:'center',borderTop:'1px solid #f1f5f9',background:'#fafbff'}}>
                    Showing 100 of {filtered.length} records — export Excel/CSV to view all
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

// Sub-components
const selStyle = c => ({background:'#f8faff',border:`1.5px solid ${c}30`,borderRadius:8,padding:'9px 12px',color:'#1e2d4a',fontSize:13,outline:'none',width:'100%',fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:'pointer'});
const lblStyle = c => ({color:c,fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.8px'});

const Sel = ({label,value,onChange,color,children}) => (
  <div style={{display:'flex',flexDirection:'column',gap:6}}>
    <label style={lblStyle(color)}>{label}</label>
    <select style={selStyle(color)} value={value} onChange={e=>onChange(e.target.value)}>{children}</select>
  </div>
);

const InputField = ({label,color,value,onChange,...rest}) => (
  <div style={{display:'flex',flexDirection:'column',gap:6}}>
    <label style={lblStyle(color)}>{label}</label>
    <input style={selStyle(color)} value={value} onChange={e=>onChange(e.target.value)} {...rest}/>
  </div>
);
