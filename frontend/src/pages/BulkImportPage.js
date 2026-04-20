import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

// ── Step constants ────────────────────────────────────────────────────────
const STEP = { IDLE:0, PREVIEWING:1, PREVIEW_DONE:2, UPLOADING:3, DONE:4 };

// ── Tiny helpers ─────────────────────────────────────────────────────────
function fmt(n) { return (n||0).toLocaleString(); }

function Badge({ label, value, color, bg }) {
  return (
    <div style={{ background:bg, border:`1.5px solid ${color}30`, borderRadius:12,
      padding:'14px 20px', flex:'1 1 120px', minWidth:0 }}>
      <div style={{ color, fontSize:22, fontWeight:800 }}>{fmt(value)}</div>
      <div style={{ color:'#64748b', fontSize:11, marginTop:3, fontWeight:600 }}>{label}</div>
    </div>
  );
}

function StepBadge({ step, label, active, done }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{
        width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center',
        justifyContent:'center', fontSize:12, fontWeight:800,
        background: done?'#10b981':active?'#2563eb':'#e2e8f8',
        color: done||active?'#fff':'#94a3b8',
        boxShadow: active?'0 0 0 4px rgba(37,99,235,0.15)':'none',
        transition:'all 0.3s',
      }}>
        {done ? '✓' : step}
      </div>
      <span style={{ fontSize:12, fontWeight:600,
        color: done?'#10b981':active?'#2563eb':'#94a3b8' }}>{label}</span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function BulkImportPage() {
  const { API, user } = useAuth();
  const fileInput = useRef();

  const [step,     setStep]     = useState(STEP.IDLE);
  const [dragOver, setDragOver] = useState(false);
  const [file,     setFile]     = useState(null);
  const [preview,  setPreview]  = useState(null);   // { ok, summary, errors, columns }
  const [result,   setResult]   = useState(null);   // { stats, errors, message }
  const [error,    setError]    = useState('');
  const [errPage,  setErrPage]  = useState(0);
  const ERR_PAGE_SIZE = 20;

  // ── File selection ──────────────────────────────────────────────────────
  const selectFile = useCallback((f) => {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) { setError('Only .xlsx or .xls files are accepted.'); return; }
    if (f.size > 10*1024*1024)           { setError('File size must be under 10 MB.');         return; }
    setFile(f); setError(''); setPreview(null); setResult(null); setStep(STEP.IDLE);
  }, []);

  const onDrop = useCallback(e => {
    e.preventDefault(); setDragOver(false);
    selectFile(e.dataTransfer.files?.[0]);
  }, [selectFile]);

  const onDragOver = e => { e.preventDefault(); setDragOver(true); };
  const onDragLeave= () => setDragOver(false);

  // ── Preview (dry run) ───────────────────────────────────────────────────
  const runPreview = async () => {
    if (!file) return;
    setStep(STEP.PREVIEWING); setError(''); setErrPage(0);
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/import/preview`, fd,
        { headers:{ 'Content-Type':'multipart/form-data' } });
      setPreview(data); setStep(STEP.PREVIEW_DONE);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      setStep(STEP.IDLE);
    }
  };

  // ── Actual upload ───────────────────────────────────────────────────────
  const runUpload = async () => {
    if (!file) return;
    setStep(STEP.UPLOADING); setError(''); setErrPage(0);
    const fd = new FormData(); fd.append('file', file);
    try {
      const { data } = await axios.post(`${API}/import/upload`, fd,
        { headers:{ 'Content-Type':'multipart/form-data' } });
      setResult(data); setStep(STEP.DONE);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
      if (err.response?.data?.errors) {
        setPreview(p => ({ ...p, errors:err.response.data.errors }));
      }
      setStep(STEP.PREVIEW_DONE);
    }
  };

  const reset = () => {
    setStep(STEP.IDLE); setFile(null); setPreview(null);
    setResult(null); setError('');
  };

  // ── Paged errors ────────────────────────────────────────────────────────
  const allErrors  = preview?.errors || [];
  const errTotal   = allErrors.length;
  const errPages   = Math.ceil(errTotal / ERR_PAGE_SIZE);
  const pagedErrs  = allErrors.slice(errPage*ERR_PAGE_SIZE, (errPage+1)*ERR_PAGE_SIZE);

  const isAdmin = user?.role==='admin';
  const isDEO   = user?.role==='deo';
  const canImport = isAdmin||isDEO;

  // ── Template download ───────────────────────────────────────────────────
  const downloadTemplate = () => {
    const rows = [
      ['registerno','name','department','section','batch','semester','cgpa',
       'attendance%','subject','marks','result','backlogs'],
      ['22AG1A0501','Student Name','CSE','A','2022-2026',3,7.5,82,'DSA',65,'pass',0],
      ['22AG1A0502','Another Student','CSE','A','2022-2026',3,6.8,76,'DSA',55,'pass',1],
    ];
    const ws = {};
    rows.forEach((row, r) =>
      row.forEach((val, c) => {
        const cell = String.fromCharCode(65+c)+(r+1);
        ws[cell] = { v:val, t:typeof val==='number'?'n':'s' };
      })
    );
    ws['!ref'] = `A1:L${rows.length}`;
    const wb = { SheetNames:['Students'], Sheets:{ Students:ws } };
    // Use dynamic import-style URL creation for xlsx
    const wbout = encodeURIComponent(JSON.stringify(wb));
    // Fallback: just download a CSV template
    const csv = rows.map(r=>r.join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='import_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!canImport) return (
    <div style={{ padding:40, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ background:'#fff1f2', border:'1.5px solid #fecdd3', borderRadius:16,
        padding:32, textAlign:'center', color:'#be123c' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
        <div style={{ fontSize:18, fontWeight:700 }}>Access Restricted</div>
        <div style={{ fontSize:13, marginTop:8, color:'#9f1239' }}>
          Bulk import is available to Admin and DEO roles only.
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ padding:'28px 32px', fontFamily:"'Plus Jakarta Sans',sans-serif",
      background:'#f0f4ff', minHeight:'100vh' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom:28 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
          <div style={{ width:44, height:44, borderRadius:12,
            background:'linear-gradient(135deg,#2563eb,#7c3aed)',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:22, boxShadow:'0 4px 15px rgba(37,99,235,0.3)' }}>📥</div>
          <div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#1e2d4a',
              fontFamily:"'Sora',sans-serif" }}>Bulk Excel Import</h1>
            <p style={{ margin:0, color:'#64748b', fontSize:12, marginTop:2 }}>
              Upload student data from Excel — validated row by row before saving
            </p>
          </div>
        </div>

        {/* Stepper */}
        <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:16,
          background:'#fff', borderRadius:12, padding:'14px 20px',
          border:'1.5px solid #e2e8f8', boxShadow:'0 2px 8px rgba(30,45,74,0.04)' }}>
          <StepBadge step={1} label="Select File"    active={step===STEP.IDLE}        done={step>STEP.IDLE}/>
          <div style={{ flex:1, height:2, background: step>=STEP.PREVIEW_DONE?'#2563eb':'#e2e8f8',
            transition:'background 0.4s', borderRadius:2, margin:'0 4px' }}/>
          <StepBadge step={2} label="Validate"       active={step===STEP.PREVIEWING||step===STEP.PREVIEW_DONE} done={step>=STEP.UPLOADING}/>
          <div style={{ flex:1, height:2, background: step>=STEP.DONE?'#10b981':'#e2e8f8',
            transition:'background 0.4s', borderRadius:2, margin:'0 4px' }}/>
          <StepBadge step={3} label="Import to DB"   active={step===STEP.UPLOADING}   done={step===STEP.DONE}/>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24, alignItems:'start' }}>

        {/* ── Left panel ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

          {/* Drop zone */}
          {step!==STEP.DONE && (
            <div style={{ background:'#fff', borderRadius:16, padding:28,
              border:'1.5px solid #e2e8f8', boxShadow:'0 2px 12px rgba(30,45,74,0.04)' }}>
              <div
                onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                onClick={() => !file && fileInput.current?.click()}
                style={{
                  border: `2px dashed ${dragOver?'#2563eb':file?'#10b981':'#c7d2fe'}`,
                  borderRadius:12, padding:'40px 24px', textAlign:'center',
                  background: dragOver?'#eff6ff':file?'#f0fdf4':'#f8faff',
                  cursor:file?'default':'pointer', transition:'all 0.25s',
                  transform: dragOver?'scale(1.01)':'scale(1)',
                }}>
                <input ref={fileInput} type="file" accept=".xlsx,.xls"
                  style={{ display:'none' }} onChange={e=>selectFile(e.target.files?.[0])}/>

                {!file ? (
                  <>
                    <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#1e2d4a', marginBottom:6 }}>
                      Drag & drop your Excel file here
                    </div>
                    <div style={{ fontSize:12, color:'#94a3b8', marginBottom:16 }}>
                      or click to browse — .xlsx / .xls, up to 10 MB
                    </div>
                    <button onClick={e=>{e.stopPropagation();fileInput.current?.click();}}
                      style={{ background:'linear-gradient(135deg,#2563eb,#6366f1)',
                        color:'#fff', border:'none', borderRadius:8, padding:'10px 24px',
                        fontSize:13, fontWeight:700, cursor:'pointer',
                        boxShadow:'0 4px 14px rgba(37,99,235,0.3)' }}>
                      Browse Files
                    </button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:40, marginBottom:8 }}>✅</div>
                    <div style={{ fontSize:15, fontWeight:700, color:'#065f46', marginBottom:4 }}>
                      {file.name}
                    </div>
                    <div style={{ fontSize:12, color:'#6ee7b7', marginBottom:16 }}>
                      {(file.size/1024).toFixed(1)} KB
                    </div>
                    <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                      <button onClick={e=>{e.stopPropagation();fileInput.current?.click();}}
                        style={{ background:'#f0fdf4', border:'1.5px solid #a7f3d0',
                          color:'#065f46', borderRadius:8, padding:'8px 18px',
                          fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        Change File
                      </button>
                      {step===STEP.IDLE && (
                        <button onClick={runPreview}
                          style={{ background:'linear-gradient(135deg,#2563eb,#6366f1)',
                            color:'#fff', border:'none', borderRadius:8, padding:'8px 22px',
                            fontSize:12, fontWeight:700, cursor:'pointer',
                            boxShadow:'0 4px 12px rgba(37,99,235,0.3)' }}>
                          🔍 Validate File
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {error && (
                <div style={{ marginTop:14, background:'#fff1f2', border:'1.5px solid #fecdd3',
                  borderRadius:10, padding:'12px 16px', color:'#be123c', fontSize:13, fontWeight:600 }}>
                  ⚠️ {error}
                </div>
              )}
            </div>
          )}

          {/* Previewing spinner */}
          {step===STEP.PREVIEWING && (
            <div style={{ background:'#fff', borderRadius:16, padding:40, textAlign:'center',
              border:'1.5px solid #e2e8f8' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', border:'4px solid #bfdbfe',
                borderTop:'4px solid #2563eb', animation:'spin 0.8s linear infinite',
                margin:'0 auto 16px' }}/>
              <div style={{ color:'#2563eb', fontWeight:700 }}>Validating rows…</div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* Uploading spinner */}
          {step===STEP.UPLOADING && (
            <div style={{ background:'#fff', borderRadius:16, padding:40, textAlign:'center',
              border:'1.5px solid #e2e8f8' }}>
              <div style={{ width:40, height:40, borderRadius:'50%', border:'4px solid #a7f3d0',
                borderTop:'4px solid #10b981', animation:'spin 0.8s linear infinite',
                margin:'0 auto 16px' }}/>
              <div style={{ color:'#059669', fontWeight:700 }}>Saving to database…</div>
            </div>
          )}

          {/* Preview results */}
          {(step===STEP.PREVIEW_DONE) && preview && (
            <div style={{ background:'#fff', borderRadius:16, padding:24,
              border:`1.5px solid ${preview.ok?'#a7f3d0':'#fca5a5'}`,
              boxShadow:'0 2px 12px rgba(30,45,74,0.04)' }}>

              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <span style={{ fontSize:22 }}>{preview.ok?'✅':'⚠️'}</span>
                <div>
                  <div style={{ fontSize:15, fontWeight:800, color:'#1e2d4a' }}>
                    {preview.ok ? 'Validation passed — ready to import' : 'Validation found issues'}
                  </div>
                  <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                    Sheet: <strong>{preview.summary.sheetName}</strong> · {preview.summary.fileName}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
                <Badge label="Total Rows"      value={preview.summary.totalRows}      color="#2563eb" bg="#eff6ff"/>
                <Badge label="Valid Rows"      value={preview.summary.validRows}      color="#059669" bg="#f0fdf4"/>
                <Badge label="Error Rows"      value={preview.summary.errorRows}      color="#dc2626" bg="#fff1f2"/>
                <Badge label="Unique Students" value={preview.summary.uniqueStudents} color="#7c3aed" bg="#faf5ff"/>
              </div>

              {/* Error table */}
              {errTotal>0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#dc2626', marginBottom:10 }}>
                    🚫 Row Errors ({errTotal} rows — must fix before importing)
                  </div>
                  <div style={{ overflowX:'auto', borderRadius:10,
                    border:'1.5px solid #fecdd3', background:'#fff' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:'#fff1f2' }}>
                          <th style={TH('#dc2626')}>Excel Row</th>
                          <th style={TH('#dc2626')}>Roll Number</th>
                          <th style={TH('#dc2626')}>Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedErrs.map((e,i)=>(
                          <tr key={i} style={{ borderTop:'1px solid #fee2e2',
                            background:i%2===0?'#fff':'#fffafa' }}>
                            <td style={TD}>{e.row}</td>
                            <td style={{ ...TD, fontFamily:'monospace', color:'#7f1d1d' }}>{e.roll||'—'}</td>
                            <td style={TD}>
                              {e.errs.map((err,j)=>(
                                <span key={j} style={{ display:'inline-block',
                                  background:'#fee2e2', color:'#dc2626', borderRadius:5,
                                  padding:'2px 8px', fontSize:11, marginRight:4, marginBottom:3,
                                  fontWeight:600 }}>{err}</span>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {errPages>1 && (
                    <div style={{ display:'flex', gap:8, marginTop:10, justifyContent:'flex-end',
                      alignItems:'center' }}>
                      <span style={{ fontSize:11, color:'#94a3b8' }}>
                        Page {errPage+1} of {errPages}
                      </span>
                      {[...Array(Math.min(errPages,6))].map((_,i)=>(
                        <button key={i} onClick={()=>setErrPage(i)}
                          style={{ width:26, height:26, borderRadius:6, border:'1.5px solid',
                            borderColor:errPage===i?'#dc2626':'#e2e8f8', fontSize:11,
                            background:errPage===i?'#fff1f2':'#fff', cursor:'pointer',
                            color:errPage===i?'#dc2626':'#64748b', fontWeight:700 }}>
                          {i+1}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                {preview.ok || preview.summary.validRows>0 ? (
                  <button onClick={runUpload}
                    style={{ background:'linear-gradient(135deg,#059669,#10b981)',
                      color:'#fff', border:'none', borderRadius:10, padding:'12px 28px',
                      fontSize:14, fontWeight:700, cursor:'pointer',
                      boxShadow:'0 4px 14px rgba(5,150,105,0.3)', flex:1 }}>
                    {preview.ok
                      ? `✅ Import ${fmt(preview.summary.uniqueStudents)} Students`
                      : `⚠️ Import ${fmt(preview.summary.validRows)} Valid Rows (skip ${preview.summary.errorRows} errors)`}
                  </button>
                ) : null}
                <button onClick={reset}
                  style={{ background:'#f8faff', border:'1.5px solid #e2e8f8', color:'#64748b',
                    borderRadius:10, padding:'12px 20px', fontSize:13, fontWeight:700,
                    cursor:'pointer' }}>
                  ✕ Cancel
                </button>
              </div>
            </div>
          )}

          {/* Success result */}
          {step===STEP.DONE && result && (
            <div style={{ background:'#f0fdf4', borderRadius:16, padding:32, textAlign:'center',
              border:'1.5px solid #a7f3d0', boxShadow:'0 2px 12px rgba(5,150,105,0.08)' }}>
              <div style={{ fontSize:56, marginBottom:12 }}>🎉</div>
              <div style={{ fontSize:20, fontWeight:800, color:'#065f46', marginBottom:6 }}>
                Import Complete!
              </div>
              <div style={{ fontSize:13, color:'#6ee7b7', marginBottom:24 }}>
                {result.message}
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', justifyContent:'center',
                marginBottom:28 }}>
                <Badge label="Rows Processed" value={result.stats.validRows}  color="#059669" bg="#ecfdf5"/>
                <Badge label="New Students"   value={result.stats.inserted}   color="#2563eb" bg="#eff6ff"/>
                <Badge label="Updated"        value={result.stats.updated}    color="#7c3aed" bg="#faf5ff"/>
                {result.stats.errorRows>0&&
                  <Badge label="Skipped"      value={result.stats.errorRows}  color="#f59e0b" bg="#fffbeb"/>}
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                <button onClick={reset}
                  style={{ background:'linear-gradient(135deg,#2563eb,#6366f1)', color:'#fff',
                    border:'none', borderRadius:10, padding:'12px 28px', fontSize:14,
                    fontWeight:700, cursor:'pointer',
                    boxShadow:'0 4px 14px rgba(37,99,235,0.3)' }}>
                  📥 Import Another File
                </button>
                <button onClick={()=>window.dispatchEvent(new CustomEvent('navigate',{detail:'dashboard'}))}
                  style={{ background:'#f0fdf4', border:'1.5px solid #a7f3d0', color:'#065f46',
                    borderRadius:10, padding:'12px 24px', fontSize:13, fontWeight:700,
                    cursor:'pointer' }}>
                  ⊞ Go to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Right panel: guide ── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Template download */}
          <div style={{ background:'#fff', borderRadius:16, padding:20,
            border:'1.5px solid #e2e8f8', boxShadow:'0 2px 8px rgba(30,45,74,0.04)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e2d4a', marginBottom:12 }}>
              📄 Download Template
            </div>
            <p style={{ fontSize:12, color:'#64748b', margin:'0 0 14px',lineHeight:1.6 }}>
              Download a sample CSV with the correct column headers to fill in your student data.
            </p>
            <button onClick={downloadTemplate}
              style={{ width:'100%', background:'linear-gradient(135deg,#f0fdf4,#ecfdf5)',
                border:'1.5px solid #a7f3d0', color:'#065f46', borderRadius:8, padding:'10px',
                fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ⬇ Download Sample Template
            </button>
          </div>

          {/* Column guide */}
          <div style={{ background:'#fff', borderRadius:16, padding:20,
            border:'1.5px solid #e2e8f8', boxShadow:'0 2px 8px rgba(30,45,74,0.04)' }}>
            <div style={{ fontSize:14, fontWeight:800, color:'#1e2d4a', marginBottom:12 }}>
              📋 Required Columns
            </div>
            {[
              { col:'registerno', note:'Unique roll number', required:true  },
              { col:'name',       note:'Full student name',  required:true  },
              { col:'department', note:'CSE / ECE / MECH…',  required:true  },
              { col:'batch',      note:'e.g. 2022-2026',     required:true  },
              { col:'section',    note:'A / B / C',          required:false },
              { col:'semester',   note:'1 to 8',             required:false },
              { col:'cgpa',       note:'0.0 to 10.0',        required:false },
              { col:'attendance%',note:'0 to 100',           required:false },
              { col:'subject',    note:'Short name e.g. DSA',required:false },
              { col:'marks',      note:'Total marks (0-100)',required:false },
              { col:'result',     note:'pass / fail',        required:false },
              { col:'backlogs',   note:'Count of backlogs',  required:false },
            ].map(({col,note,required})=>(
              <div key={col} style={{ display:'flex', alignItems:'flex-start', gap:8,
                padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                <code style={{ fontSize:11, background:'#f0f4ff', color:'#2563eb',
                  borderRadius:4, padding:'2px 7px', fontFamily:'monospace',
                  flexShrink:0, marginTop:1 }}>{col}</code>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'#374151' }}>{note}</div>
                </div>
                {required && (
                  <span style={{ fontSize:9, background:'#fee2e2', color:'#dc2626',
                    borderRadius:4, padding:'2px 5px', fontWeight:700, flexShrink:0 }}>REQ</span>
                )}
              </div>
            ))}
          </div>

          {/* Role scope note */}
          {isDEO && (
            <div style={{ background:'#eff6ff', borderRadius:12, padding:14,
              border:'1.5px solid #bfdbfe' }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#2563eb', marginBottom:4 }}>
                🔒 Scope: {user.department} only
              </div>
              <div style={{ fontSize:11, color:'#3b82f6', lineHeight:1.5 }}>
                As a DEO, rows from other departments will be ignored during import.
              </div>
            </div>
          )}

          {/* Tips */}
          <div style={{ background:'#fffbeb', borderRadius:12, padding:16,
            border:'1.5px solid #fde68a' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e', marginBottom:8 }}>
              💡 Tips
            </div>
            {[
              'One row per student per subject is fine — rows are merged by roll number.',
              'Existing students are updated, not duplicated.',
              'Up to 10% error rows are skipped and the rest still import.',
              'Preview first to catch errors before committing to DB.',
            ].map((t,i)=>(
              <div key={i} style={{ fontSize:11, color:'#78350f', marginBottom:5,
                paddingLeft:12, position:'relative' }}>
                <span style={{ position:'absolute', left:0 }}>•</span>{t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tiny style helpers ────────────────────────────────────────────────────
const TH = color => ({
  padding:'8px 14px', textAlign:'left', fontSize:10, fontWeight:800,
  textTransform:'uppercase', letterSpacing:'0.8px', color,
  borderBottom:`1.5px solid ${color}30`,
});
const TD = {
  padding:'7px 14px', color:'#374151', verticalAlign:'top',
};
