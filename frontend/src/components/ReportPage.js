import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { exportToExcel, exportToCSV, flattenForExport } from '../utils/exportUtils';
import useToast, { parseApiError } from '../hooks/useToast';

// ─── Campus photo / colour config ───────────────────────────────────────────
const PAGE_PHOTO = {
  attendance: '/campus/n_block.jpg',    marks:   '/campus/h_block_new.jpg',
  backlogs:   '/campus/u_block_new.jpg', cgpa:   '/campus/all.jpg',
  risk:       '/campus/n_block.jpg',    toppers: '/campus/h_block_new.jpg',
};
const PAGE_STYLE = {
  attendance: { color:'#0ea5e9', g:'linear-gradient(135deg,#0ea5e9,#2563eb)', bg:'#f0f9ff', bd:'#bae6fd' },
  marks:      { color:'#f59e0b', g:'linear-gradient(135deg,#f59e0b,#f97316)', bg:'#fffbeb', bd:'#fde68a' },
  backlogs:   { color:'#ef4444', g:'linear-gradient(135deg,#ef4444,#f97316)', bg:'#fff1f2', bd:'#fecdd3' },
  cgpa:       { color:'#8b5cf6', g:'linear-gradient(135deg,#8b5cf6,#4f46e5)', bg:'#f5f3ff', bd:'#ddd6fe' },
  risk:       { color:'#f97316', g:'linear-gradient(135deg,#f97316,#ef4444)', bg:'#fff7ed', bd:'#fed7aa' },
  toppers:    { color:'#10b981', g:'linear-gradient(135deg,#10b981,#0ea5e9)', bg:'#f0fdf4', bd:'#a7f3d0' },
};

// ─── Skeleton pulse ──────────────────────────────────────────────────────────
function Skeleton({ width = '100%', height = 36, radius = 8, style = {} }) {
  return (
    <div style={{
      width, height, borderRadius: radius,
      background: 'linear-gradient(90deg,#e2e8f0 25%,#f1f5f9 50%,#e2e8f0 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.4s ease infinite',
      ...style,
    }} />
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Returns the academic-year start for today's date.
// Academic year runs June-May: Jan-May still belongs to AY that started previous calendar year.
function currentAcademicYearStart() {
  const now = new Date();
  return now.getMonth() + 1 < 6 ? now.getFullYear() - 1 : now.getFullYear();
}

// Semesters possible for a batch (+ optional academic year filter),
// always capped to what's reachable today — works even when AY is not selected.
function getSemesterOptions(batch, academicYear) {
  const all = [1,2,3,4,5,6,7,8];
  if (!batch) return all;
  const bm = String(batch).match(/^(\d{4})-(\d{4})$/);
  if (!bm) return all;

  const batchStart = Number(bm[1]);
  const curAY      = currentAcademicYearStart();

  // Batch hasn't started yet — no semesters available
  if (batchStart > curAY) return [];

  // Max semester reachable today regardless of AY filter
  const maxSem = Math.min(8, (curAY - batchStart) * 2 + 2);

  // If no AY selected: return all semesters up to maxSem
  if (!academicYear) return all.filter(s => s <= maxSem);

  const ym = String(academicYear).match(/^(\d{4})-(\d{4})$/);
  if (!ym) return all.filter(s => s <= maxSem);

  const ayStart = Number(ym[1]);

  // Block if AY is in the future
  if (ayStart > curAY) return [];

  // Return the two semesters that belong to this specific AY, capped by maxSem
  const offset     = ayStart - batchStart;
  const first      = offset * 2 + 1;
  if (first < 1 || first > 8) return all.filter(s => s <= maxSem);
  const candidates = first + 1 <= 8 ? [first, first + 1] : [first];
  return candidates.filter(s => s <= maxSem);
}

function getAcademicYearOptions(batch) {
  const fallback = ['2021-2022','2022-2023','2023-2024','2024-2025','2025-2026','2026-2027'];
  if (!batch) return fallback;
  const m = String(batch).match(/^(\d{4})-(\d{4})$/);
  if (!m) return fallback;
  const batchStart = Number(m[1]);
  const batchEnd   = Number(m[2]);
  // Never show academic years that haven't started yet
  const maxAyStart = Math.min(batchEnd - 1, currentAcademicYearStart());
  const years = [];
  for (let y = batchStart; y <= maxAyStart; y++) years.push(`${y}-${y+1}`);
  return years;
}

// ─── Searchable dropdown ─────────────────────────────────────────────────────
function SearchableSelect({ label, value, onChange, options, placeholder, color, hint, loading: metaLoading }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  useEffect(() => { if (!open) setQuery(''); }, [open]);

  // Show skeleton while meta is loading
  if (metaLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <Skeleton width={80} height={12} radius={4} />
        <Skeleton height={38} radius={8} />
      </div>
    );
  }

  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;
  const selected = options.find(o => o.value === value);
  const displayLabel = selected ? selected.label : (placeholder || `All ${label.replace(/ [①②③]/g,'')}s`);
  const isActive = value !== '' && value !== undefined && value !== null;

  return (
    <div ref={ref} style={{ display:'flex', flexDirection:'column', gap:5, position:'relative' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{ color: isActive ? color : '#94a3b8', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', transition:'color 0.2s' }}>
          {label}{isActive && <span style={{ marginLeft:5, color, fontSize:9 }}>●</span>}
        </label>
        {hint && !isActive && <span style={{ fontSize:9, color:'#cbd5e1', fontStyle:'italic' }}>{hint}</span>}
      </div>
      <button type="button" onClick={() => setOpen(o => !o)} style={{
        background: isActive ? `${color}10` : '#f8faff',
        border:`1.5px solid ${isActive ? color : open ? `${color}60` : '#e2e8f0'}`,
        borderRadius:8, padding:'9px 36px 9px 12px',
        color: isActive ? '#1e2d4a' : '#64748b',
        fontSize:13, outline:'none', width:'100%', textAlign:'left', cursor:'pointer',
        transition:'all 0.18s', fontFamily:"'Plus Jakarta Sans',sans-serif",
        boxShadow: open ? `0 0 0 3px ${color}18` : 'none', position:'relative',
      }}>
        <span style={{ display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight: isActive ? 700 : 400 }}>{displayLabel}</span>
        <span style={{ position:'absolute', right:10, top:'50%', transform:`translateY(-50%) rotate(${open?180:0}deg)`, transition:'transform 0.2s', color: isActive ? color : '#94a3b8', fontSize:11 }}>▾</span>
        {isActive && (
          <span onClick={e => { e.stopPropagation(); onChange(''); }}
            style={{ position:'absolute', right:28, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:14, lineHeight:1, cursor:'pointer', padding:'0 2px' }}
            title="Clear">×</span>
        )}
      </button>
      {open && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:999, marginTop:4, background:'#fff', border:`1.5px solid ${color}30`, borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,0.12)', overflow:'hidden', animation:'dropIn 0.15s ease' }}>
          {options.length > 6 && (
            <div style={{ padding:'8px 10px', borderBottom:'1px solid #f1f5f9', position:'relative' }}>
              <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#94a3b8' }}>🔍</span>
              <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Search..."
                style={{ width:'100%', border:'1px solid #e2e8f0', borderRadius:6, padding:'6px 10px 6px 28px', fontSize:12, outline:'none', fontFamily:"'Plus Jakarta Sans',sans-serif", color:'#1e2d4a', background:'#f8faff' }} />
            </div>
          )}
          <div style={{ maxHeight:200, overflowY:'auto' }}>
            <div onClick={() => { onChange(''); setOpen(false); }}
              style={{ padding:'9px 14px', cursor:'pointer', fontSize:13, color: value==='' ? color : '#64748b', background: value==='' ? `${color}08` : 'transparent', fontWeight: value==='' ? 700 : 400, borderLeft: value==='' ? `3px solid ${color}` : '3px solid transparent' }}
              onMouseEnter={e => e.currentTarget.style.background = `${color}08`}
              onMouseLeave={e => e.currentTarget.style.background = value==='' ? `${color}08` : 'transparent'}>
              {placeholder || `All ${label.replace(/ [①②③]/g,'')}s`}
            </div>
            {filtered.length > 0 && <div style={{ height:1, background:'#f1f5f9', margin:'2px 0' }}/>}
            {filtered.length === 0 ? (
              <div style={{ padding:'14px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>No results for "{query}"</div>
            ) : filtered.map(opt => (
              <div key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{ padding:'9px 14px', cursor:'pointer', fontSize:13, color: opt.value===value ? color : '#1e2d4a', fontWeight: opt.value===value ? 700 : 400, background: opt.value===value ? `${color}10` : 'transparent', borderLeft: opt.value===value ? `3px solid ${color}` : '3px solid transparent', display:'flex', alignItems:'center', justifyContent:'space-between' }}
                onMouseEnter={e => { if (opt.value !== value) e.currentTarget.style.background = `${color}06`; }}
                onMouseLeave={e => { if (opt.value !== value) e.currentTarget.style.background = 'transparent'; }}>
                <span>{opt.label}</span>
                {opt.value === value && <span style={{ fontSize:12 }}>✓</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Filter tag pill ─────────────────────────────────────────────────────────
function FilterTag({ label, value, onRemove, color }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:`${color}12`, border:`1px solid ${color}30`, color, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
      <span style={{ color:'#94a3b8', fontWeight:400, fontSize:10 }}>{label}:</span>
      {value}
      <span onClick={onRemove} style={{ cursor:'pointer', color:`${color}80`, marginLeft:2, fontSize:13, lineHeight:1 }} title="Remove">×</span>
    </span>
  );
}

// ─── Number input ────────────────────────────────────────────────────────────
const InputField = ({ label, color, value, onChange, hint, ...rest }) => {
  const isActive = value !== '' && value !== undefined;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <label style={{ color: isActive ? color : '#94a3b8', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.8px', transition:'color 0.2s' }}>
          {label}{isActive && <span style={{ marginLeft:5, color, fontSize:9 }}>●</span>}
        </label>
        {hint && !isActive && <span style={{ fontSize:9, color:'#cbd5e1', fontStyle:'italic' }}>{hint}</span>}
      </div>
      <input value={value} onChange={e => onChange(e.target.value)} {...rest}
        style={{ background: isActive ? `${color}10` : '#f8faff', border:`1.5px solid ${isActive ? color : '#e2e8f0'}`, borderRadius:8, padding:'9px 12px', color:'#1e2d4a', fontSize:13, outline:'none', width:'100%', fontFamily:"'Plus Jakarta Sans',sans-serif", transition:'all 0.18s' }}
        onFocus={e => e.target.style.boxShadow = `0 0 0 3px ${color}18`}
        onBlur={e  => e.target.style.boxShadow = 'none'} />
    </div>
  );
};

// ─── Smart empty state — shows exactly which filters produced zero results ───
function EmptyState({ ps, activeFilters, filterLabels, getFilterDisplayValue, onClear }) {
  const hasFilters = activeFilters.length > 0;
  return (
    <div style={{ textAlign:'center', padding:'50px 32px 60px', color:'#94a3b8' }}>
      <div style={{ fontSize:44, marginBottom:12 }}>😕</div>
      <div style={{ fontSize:15, fontWeight:700, color:'#374151' }}>No records found</div>
      {hasFilters ? (
        <>
          <div style={{ fontSize:13, marginTop:6, color:'#64748b' }}>
            No results matched{' '}
            <strong style={{ color: ps.color }}>
              {activeFilters.map(([k, v]) => `${filterLabels[k] || k}: ${getFilterDisplayValue(k, v)}`).join(', ')}
            </strong>
          </div>
          <div style={{ marginTop:16, display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
            <button onClick={onClear}
              style={{ background: ps.g, color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
              Clear all filters
            </button>
            <span style={{ color:'#94a3b8', fontSize:13, alignSelf:'center' }}>and try again</span>
          </div>
        </>
      ) : (
        <div style={{ fontSize:13, marginTop:6, color:'#64748b' }}>Try adjusting your filters and generate again</div>
      )}
    </div>
  );
}

// ─── Main ReportPage ─────────────────────────────────────────────────────────
export default function ReportPage({ reportType, title, icon, description, filterConfig, columns, columnSets }) {
  const { API, user } = useAuth();
  const { showApiError, ToastContainer } = useToast();

  const [filters,    setFilters]    = useState({});
  const [data,       setData]       = useState([]);
  const [meta,       setMeta]       = useState({ departments:[], batches:[], sections:[] });
  const [metaLoading,setMetaLoading]= useState(true);  // ③ skeleton state
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);
  const [search,     setSearch]     = useState('');
  const [hovRow,     setHovRow]     = useState(null);
  const [hovBtn,     setHovBtn]     = useState('');
  const [activeType, setActiveType] = useState('');

  const ps = PAGE_STYLE[reportType] || PAGE_STYLE.attendance;
  const academicYearOptions = getAcademicYearOptions(filters.batch);
  const semesterOptions     = getSemesterOptions(filters.batch, filters.academicYear);

  useEffect(() => {
    if (filters.semester && !semesterOptions.includes(parseInt(filters.semester, 10)))
      setFilters(prev => ({ ...prev, semester: '' }));
  }, [filters.semester, semesterOptions]);

  useEffect(() => {
    if (filters.academicYear && !academicYearOptions.includes(filters.academicYear))
      setFilters(prev => ({ ...prev, academicYear: '', semester: '' }));
  }, [filters.academicYear, academicYearOptions]);

  // ③ meta fetch with skeleton + error toast
  useEffect(() => {
    setMetaLoading(true);
    axios.get(`${API}/students/meta`)
      .then(r => { setMeta(r.data); setMetaLoading(false); })
      .catch(err => {
        setMetaLoading(false);
        showApiError(err);
      });
  }, [API]);

  const selTypes      = filterConfig?.types || [];
  const activeColumns = (columnSets && columnSets[activeType]) ? columnSets[activeType] : columns;

  const filterLabels = {
    department:'Department', batch:'Batch', section:'Section',
    semester:'Semester', type:'Report Type', threshold:'Threshold %',
    limit:'Top N', academicYear:'Academic Year',
  };
  const getFilterDisplayValue = (key, val) => {
    if (key === 'semester') return `Sem ${val}`;
    if (key === 'type') return selTypes.find(t => t.value === val)?.label || val;
    return val;
  };

  const activeFilterEntries = Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined && v !== null);
  const clearFilter     = key => setFilters(prev => ({ ...prev, [key]: '' }));
  const clearAllFilters = ()  => setFilters({});

  // ① structured error handling via toast
  const fetchReport = useCallback(async () => {
    setLoading(true); setSearched(true);
    setActiveType(filters.type || '');
    try {
      let ep = '';
      const qp = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v && k !== 'type') qp.append(k, v); });
      switch (reportType) {
        case 'attendance': ep = `/reports/attendance?type=${filters.type||'section_wise'}&${qp}`; break;
        case 'marks':      ep = `/reports/marks?type=${filters.type||'external'}&${qp}`;          break;
        case 'backlogs':   ep = `/reports/backlogs?subtype=${filters.type||''}&${qp}`;            break;
        case 'cgpa':       ep = `/reports/cgpa?type=${filters.type||'ranking'}&${qp}`;            break;
        case 'risk':       ep = `/reports/risk?riskType=${filters.type||''}&${qp}`;               break;
        case 'toppers':    ep = `/reports/top-performers?limit=${filters.limit||10}&${qp}`;       break;
        default:           ep = `/reports/${reportType}?${qp}`;
      }
      const res = await axios.get(`${API}${ep}`);
      const raw = res.data;
      setData(Array.isArray(raw.data || raw.distribution) ? (raw.data || raw.distribution) : []);
    } catch (e) {
      // ① show structured toast instead of silent setData([])
      const parsed = parseApiError(e);
      if (parsed.code === 'INVALID_FILTER' && parsed.field) {
        showApiError(e);
        // Also highlight which filter is wrong via a field-specific message
      } else {
        showApiError(e);
      }
      setData([]);
    }
    setLoading(false);
  }, [API, filters, reportType, showApiError]);

  const filtered = data.filter(row =>
    !search || Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );
  const doExport = fmt => {
    const flat = flattenForExport(filtered, reportType);
    fmt === 'excel' ? exportToExcel(flat, `${reportType}_${activeType||'report'}`) : exportToCSV(flat, `${reportType}_${activeType||'report'}`);
  };
  const doPDF = () => {
    const qp = new URLSearchParams({ reportType, title, ...filters });
    window.open(`${API}/reports/export-pdf?${qp}`, '_blank');
  };

  return (
    <div style={{ minHeight:'100vh', background:'#f0f4ff', fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      {/* ① Toast container — renders fixed top-right */}
      <ToastContainer />

      <style>{`
        @keyframes dropIn  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gradMove{ 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
      `}</style>

      {/* Hero banner */}
      <div style={{ position:'relative', height:168, overflow:'hidden' }}>
        <img src={PAGE_PHOTO[reportType]} alt="campus"
          style={{ width:'100%', height:'100%', objectFit:'cover', objectPosition:'center 35%', filter:'brightness(0.48) saturate(1.2)' }}
          onError={e => e.target.style.display='none'} />
        <div style={{ position:'absolute', inset:0, background:`linear-gradient(90deg,rgba(10,20,55,0.93) 0%,${ps.color}22 100%)` }}/>
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:ps.g, backgroundSize:'200% 100%', animation:'gradMove 3s ease infinite' }}/>
        <div style={{ position:'absolute', top:0, left:0, right:0, background:'rgba(0,0,0,0.3)', backdropFilter:'blur(6px)', padding:'6px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontFamily:"'Sora',sans-serif", color:'#fff', fontWeight:800, fontSize:11, letterSpacing:'1px' }}>VFSTR</span>
            <span style={{ color:'rgba(255,255,255,0.25)', fontSize:10 }}>|</span>
            <span style={{ color:'rgba(255,255,255,0.55)', fontSize:10 }}>Vignan's Foundation for Science, Technology and Research</span>
          </div>
          <div style={{ display:'flex', gap:6 }}>
            {['NAAC A+','NBA','Autonomous'].map(b => (
              <span key={b} style={{ background:'rgba(255,255,255,0.12)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.85)', fontSize:9, padding:'2px 8px', borderRadius:20, fontWeight:700 }}>{b}</span>
            ))}
          </div>
        </div>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', gap:18, padding:'36px 28px 0', zIndex:1 }}>
          <div style={{ width:62, height:62, borderRadius:16, background:ps.g, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, boxShadow:`0 8px 25px ${ps.color}55`, border:'2px solid rgba(255,255,255,0.25)', flexShrink:0 }}>{icon}</div>
          <div>
            <h2 style={{ fontFamily:"'Sora',sans-serif", fontSize:22, fontWeight:800, color:'#fff', margin:0 }}>{title}</h2>
            <p style={{ color:'rgba(255,255,255,0.55)', fontSize:12, marginTop:5 }}>{description}</p>
          </div>
        </div>
      </div>

      <div style={{ padding:'22px 28px 32px' }}>

        {/* ── Smart Filter Panel ── */}
        <div style={{ background:'#fff', border:`1.5px solid ${ps.bd}`, borderRadius:16, padding:'20px 22px 22px', marginBottom:20, boxShadow:`0 4px 20px ${ps.color}10` }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:ps.color, display:'inline-block' }}/>
              <span style={{ color:ps.color, fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:'1.2px' }}>Configure Report Filters</span>
              {activeFilterEntries.length > 0 && (
                <span style={{ background:ps.color, color:'#fff', borderRadius:20, fontSize:10, fontWeight:800, padding:'1px 8px', marginLeft:4 }}>{activeFilterEntries.length} active</span>
              )}
              {/* ③ meta loading badge */}
              {metaLoading && (
                <span style={{ background:'#f1f5f9', color:'#94a3b8', borderRadius:20, fontSize:10, fontWeight:700, padding:'1px 10px', marginLeft:4, display:'inline-flex', alignItems:'center', gap:5 }}>
                  <span style={{ display:'inline-block', width:8, height:8, borderRadius:'50%', border:'2px solid #cbd5e1', borderTop:'2px solid #94a3b8', animation:'spin 0.8s linear infinite' }}/>
                  Loading options…
                </span>
              )}
            </div>
            {activeFilterEntries.length > 0 && (
              <button onClick={clearAllFilters}
                style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 12px', fontSize:11, color:'#94a3b8', cursor:'pointer', fontWeight:600, fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                onMouseEnter={e => { e.target.style.borderColor='#ef4444'; e.target.style.color='#ef4444'; }}
                onMouseLeave={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.color='#94a3b8'; }}>
                Clear all ×
              </button>
            )}
          </div>

          {activeFilterEntries.length === 0 && !metaLoading && (
            <div style={{ background:`${ps.color}06`, border:`1px dashed ${ps.color}30`, borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16 }}>💡</span>
              <span style={{ fontSize:12, color:'#64748b' }}>
                <strong style={{ color:ps.color }}>Start with Batch</strong> — it automatically narrows the Academic Year and Semester options so you can't make wrong combinations.
              </span>
            </div>
          )}

          {/* Filter grid — dropdowns show skeletons while meta loads */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(175px,1fr))', gap:14, marginBottom:activeFilterEntries.length > 0 ? 14 : 18 }}>

            {user?.role === 'admin' && (
              <SearchableSelect label="Department" value={filters.department||''} color={ps.color}
                onChange={v => setFilters({ ...filters, department:v })}
                options={meta.departments.map(d => ({ value:d, label:d }))}
                placeholder="All Departments" hint="optional" loading={metaLoading} />
            )}

            <SearchableSelect label="Batch  ①" value={filters.batch||''} color={ps.color}
              onChange={v => setFilters({ ...filters, batch:v, academicYear:'', semester:'' })}
              options={meta.batches.map(b => ({ value:b, label:b }))}
              placeholder="All Batches" hint="select first →" loading={metaLoading} />

            <SearchableSelect label="Section" value={filters.section||''} color={ps.color}
              onChange={v => setFilters({ ...filters, section:v })}
              options={meta.sections.map(s => ({ value:s, label:`Section ${s}` }))}
              placeholder="All Sections" hint="optional" loading={metaLoading} />

            {filterConfig?.showAcademicYear && (
              <SearchableSelect label="Academic Year  ②" value={filters.academicYear||''} color={ps.color}
                onChange={v => setFilters({ ...filters, academicYear:v, semester:'' })}
                options={academicYearOptions.map(y => ({ value:y, label:y }))}
                placeholder="All Years" hint={!filters.batch ? '← pick Batch first' : 'narrows semester ↓'} />
            )}

            <SearchableSelect
              label={`Semester  ${filterConfig?.showAcademicYear ? '③' : '②'}`}
              value={filters.semester||''} color={ps.color}
              onChange={v => setFilters({ ...filters, semester:v })}
              options={semesterOptions.map(s => ({ value:String(s), label:`Semester ${s}` }))}
              placeholder="All Semesters" hint={!filters.batch ? '← pick Batch first' : ''} />

            {filterConfig?.showType && selTypes.length > 0 && (
              <SearchableSelect label="Report Type" value={filters.type||''} color={ps.color}
                onChange={v => setFilters({ ...filters, type:v })}
                options={selTypes.map(t => ({ value:t.value, label:t.label }))}
                placeholder="All Types" hint="changes columns" />
            )}

            {filterConfig?.showThreshold && (
              <InputField label="Threshold %" color={ps.color} type="number" min="0" max="100"
                placeholder="75" hint="default 75%" value={filters.threshold||''}
                onChange={v => setFilters({ ...filters, threshold:v })} />
            )}

            {filterConfig?.showLimit && (
              <InputField label="Top N Students" color={ps.color} type="number" min="1" max="200"
                placeholder="10" hint="default 10" value={filters.limit||''}
                onChange={v => setFilters({ ...filters, limit:v })} />
            )}
          </div>

          {activeFilterEntries.length > 0 && (
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:16, padding:'10px 14px', background:`${ps.color}06`, borderRadius:8, alignItems:'center' }}>
              <span style={{ fontSize:10, color:'#94a3b8', fontWeight:700, marginRight:4, textTransform:'uppercase', letterSpacing:'0.5px' }}>Active:</span>
              {activeFilterEntries.map(([key, val]) => (
                <FilterTag key={key} label={filterLabels[key]||key} value={getFilterDisplayValue(key, val)} onRemove={() => clearFilter(key)} color={ps.color} />
              ))}
            </div>
          )}

          <button onClick={fetchReport} disabled={loading || metaLoading}
            style={{ background: hovBtn==='gen' ? ps.g : `linear-gradient(135deg,${ps.color},${ps.color}cc)`, color:'#fff', border:'none', borderRadius:10, padding:'11px 28px', fontSize:14, fontWeight:700, cursor: (loading || metaLoading) ? 'not-allowed' : 'pointer', transition:'all 0.25s', fontFamily:"'Plus Jakarta Sans',sans-serif", opacity: metaLoading ? 0.6 : 1, transform: hovBtn==='gen' ? 'translateY(-3px)' : 'none', boxShadow: hovBtn==='gen' ? `0 10px 30px ${ps.color}55` : `0 4px 14px ${ps.color}30` }}
            onMouseEnter={() => setHovBtn('gen')} onMouseLeave={() => setHovBtn('')}>
            {loading
              ? <span style={{ display:'inline-block', animation:'spin 0.8s linear infinite' }}>⟳  Generating...</span>
              : metaLoading
                ? '⏳ Loading options...'
                : `Generate ${title} →`}
          </button>
        </div>

        {/* Results table */}
        {searched && (
          <div style={{ background:'#fff', border:'1.5px solid #e2e8f8', borderRadius:16, overflow:'hidden', boxShadow:'0 4px 20px rgba(30,58,138,0.06)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom:`2px solid ${ps.bd}`, background:ps.bg }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ background:ps.g, color:'#fff', padding:'4px 16px', borderRadius:20, fontSize:16, fontWeight:800, fontFamily:"'Sora',sans-serif", boxShadow:`0 4px 12px ${ps.color}30`, minWidth:40, textAlign:'center' }}>{filtered.length}</div>
                <div>
                  <span style={{ color:'#374151', fontWeight:600, fontSize:13 }}>records found</span>
                  {activeType && (
                    <span style={{ marginLeft:8, color:ps.color, fontSize:11, fontWeight:700, background:ps.bg, border:`1px solid ${ps.bd}`, padding:'2px 8px', borderRadius:20 }}>
                      {selTypes.find(t => t.value===activeType)?.label || activeType.replace(/_/g,' ')}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#94a3b8', fontSize:13 }}>🔍</span>
                  <input style={{ background:'#f8faff', border:'1.5px solid #e2e8f8', borderRadius:8, padding:'7px 12px 7px 32px', color:'#1e2d4a', fontSize:13, outline:'none', width:200, fontFamily:"'Plus Jakarta Sans',sans-serif" }}
                    placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                {[
                  { fmt:'excel', label:'📊 Excel', c:'#10b981', bg:'#f0fdf4', bd:'#a7f3d0' },
                  { fmt:'csv',   label:'📄 CSV',   c:'#0ea5e9', bg:'#f0f9ff', bd:'#bae6fd' },
                  { fmt:'pdf',   label:'📕 PDF',   c:'#ef4444', bg:'#fff1f2', bd:'#fecdd3' },
                ].map(b => (
                  <button key={b.fmt}
                    style={{ background:hovBtn===b.fmt?b.bg:'#f8faff', border:`1.5px solid ${hovBtn===b.fmt?b.bd:'#e2e8f8'}`, color:hovBtn===b.fmt?b.c:'#64748b', borderRadius:8, padding:'7px 12px', fontSize:12, cursor:'pointer', transition:'all 0.2s', fontWeight:700, fontFamily:"'Plus Jakarta Sans',sans-serif", transform:hovBtn===b.fmt?'translateY(-2px)':'none', boxShadow:hovBtn===b.fmt?`0 4px 12px ${b.c}25`:'none' }}
                    onClick={() => b.fmt==='pdf' ? doPDF() : doExport(b.fmt)}
                    onMouseEnter={() => setHovBtn(b.fmt)} onMouseLeave={() => setHovBtn('')}>{b.label}</button>
                ))}
              </div>
            </div>

            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'55px 0', gap:14 }}>
                <div style={{ width:40, height:40, border:`3px solid ${ps.color}25`, borderTop:`3px solid ${ps.color}`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>
                <div style={{ color:ps.color, fontSize:13, fontWeight:600 }}>Fetching data from database...</div>
              </div>
            ) : filtered.length === 0 ? (
              /* ③ Smart empty state */
              <EmptyState
                ps={ps}
                activeFilters={activeFilterEntries}
                filterLabels={filterLabels}
                getFilterDisplayValue={getFilterDisplayValue}
                onClear={clearAllFilters}
              />
            ) : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#f8faff' }}>
                      <th style={{ color:ps.color, padding:'10px 14px', textAlign:'left', fontWeight:800, fontSize:10, textTransform:'uppercase', letterSpacing:'0.8px', whiteSpace:'nowrap', borderBottom:`2px solid ${ps.bd}`, width:50 }}>#</th>
                      {activeColumns.map(c => (
                        <th key={c.key} style={{ color:ps.color, padding:'10px 14px', textAlign:'left', fontWeight:800, fontSize:10, textTransform:'uppercase', letterSpacing:'0.8px', whiteSpace:'nowrap', borderBottom:`2px solid ${ps.bd}` }}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,100).map((row,i) => (
                      <tr key={i}
                        style={{ background:hovRow===i?ps.bg:i%2===0?'#fafbff':'#fff', borderLeft:`3px solid ${hovRow===i?ps.color:'transparent'}`, transition:'all 0.15s', cursor:'default' }}
                        onMouseEnter={() => setHovRow(i)} onMouseLeave={() => setHovRow(null)}>
                        <td style={{ color:'#94a3b8', padding:'10px 14px', fontSize:12, borderBottom:'1px solid #f1f5f9' }}>{i+1}</td>
                        {activeColumns.map(c => (
                          <td key={c.key} style={{ color:'#374151', padding:'10px 14px', whiteSpace:'nowrap', borderBottom:'1px solid #f1f5f9' }}>
                            {c.render ? c.render(row)
                              : Array.isArray(row[c.key]) ? row[c.key].join(', ')
                              : (row[c.key] !== undefined && row[c.key] !== null && String(row[c.key]) !== '')
                                ? String(row[c.key])
                                : <span style={{ color:'#e2e8f0', fontSize:11 }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 100 && (
                  <div style={{ color:'#94a3b8', fontSize:12, padding:'12px 20px', textAlign:'center', borderTop:'1px solid #f1f5f9', background:'#fafbff' }}>
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