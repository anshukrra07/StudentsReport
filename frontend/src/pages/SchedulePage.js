import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const FREQS = [
  {v:'daily',   label:'Daily',   icon:'📅', desc:'Every day at 8:00 AM'},
  {v:'weekly',  label:'Weekly',  icon:'📆', desc:'Every Monday at 8:00 AM'},
  {v:'monthly', label:'Monthly', icon:'🗓', desc:'1st of each month'},
];
const REPORTS = [
  {v:'attendance', label:'Attendance Report', icon:'⊡', c:'#00e676'},
  {v:'marks',      label:'Marks & Results',   icon:'◈', c:'#ffd600'},
  {v:'backlogs',   label:'Backlog Report',    icon:'⚠', c:'#ff1744'},
  {v:'cgpa',       label:'CGPA Rankings',     icon:'★', c:'#d500f9'},
  {v:'risk',       label:'At-Risk Students',  icon:'⚡', c:'#ff6d00'},
  {v:'toppers',    label:'Top Performers',    icon:'▲', c:'#00e5ff'},
];

export default function SchedulePage() {
  const {API} = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [form, setForm] = useState({reportType:'attendance',frequency:'weekly',email:'',label:''});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [hov, setHov] = useState('');

  const load = () => axios.get(`${API}/reports/schedules`).then(r=>setSchedules(r.data)).catch(()=>{});
  useEffect(()=>{ load(); },[API]);

  const save = async e => {
    e.preventDefault();
    if(!form.email) return setMsg('Please enter an email address.');
    setSaving(true); setMsg('');
    try {
      await axios.post(`${API}/reports/schedule`, form);
      setMsg('✅ Schedule saved successfully!');
      setForm({reportType:'attendance',frequency:'weekly',email:'',label:''});
      load();
    } catch(e){ setMsg('❌ Failed to save: '+e.message); }
    setSaving(false);
  };

  const del = async id => {
    await axios.delete(`${API}/reports/schedule/${id}`).catch(()=>{});
    load();
  };

  const rc = REPORTS.find(r=>r.v===form.reportType);

  return (
    <div style={{minHeight:'100vh',fontFamily:"'Nunito',sans-serif"}}>
      {/* Hero */}
      <div style={{position:'relative',height:130,overflow:'hidden'}}>
        <img src="/campus/u_block.jpg" alt="campus" style={{width:'100%',height:'100%',objectFit:'cover',filter:'brightness(0.35) saturate(1.1)'}} onError={e=>{e.target.style.display='none';}}/>
        <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(5,12,26,0.95),rgba(64,196,255,0.2))'}}/>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'linear-gradient(90deg,#40c4ff,#00e5ff,#40c4ff)',backgroundSize:'200%',animation:'gradMove 3s ease infinite'}}/>
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',gap:18,padding:'0 32px',zIndex:1}}>
          <div style={{width:56,height:56,borderRadius:14,background:'linear-gradient(135deg,#40c4ff,#0088d1)',border:'2px solid rgba(64,196,255,0.5)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:24,boxShadow:'0 0 25px rgba(64,196,255,0.4)'}}>📅</div>
          <div>
            <h2 style={{fontFamily:"'Raleway',sans-serif",fontSize:24,fontWeight:900,color:'#fff',margin:0}}>Automated Report Scheduling</h2>
            <p style={{color:'rgba(64,196,255,0.6)',fontSize:13,marginTop:5}}>Set up recurring reports — daily, weekly, or monthly delivery</p>
          </div>
        </div>
      </div>

      <div style={{padding:'24px 32px 32px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}}>
        {/* Create schedule form */}
        <div style={{background:'linear-gradient(145deg,#0a1628,#060e1c)',border:'1px solid rgba(64,196,255,0.15)',borderRadius:16,padding:'24px',boxShadow:'0 4px 30px rgba(0,0,0,0.4)'}}>
          <div style={{color:'rgba(64,196,255,0.6)',fontSize:10,textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:800,marginBottom:20}}>📅  Create New Schedule</div>

          <form onSubmit={save} style={{display:'flex',flexDirection:'column',gap:18}}>
            {/* Report type */}
            <div>
              <label style={{color:'#7ec8e3',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:10}}>Report Type</label>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {REPORTS.map(r=>(
                  <button key={r.v} type="button"
                    style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',border:`1.5px solid ${form.reportType===r.v?r.c:'rgba(255,255,255,0.07)'}`,borderRadius:8,background:form.reportType===r.v?`${r.c}15`:'rgba(255,255,255,0.03)',cursor:'pointer',transition:'all 0.2s',fontFamily:"'Nunito',sans-serif",color:form.reportType===r.v?r.c:'#a8d8ea',fontWeight:700,fontSize:12,transform:hov===r.v?'scale(1.02)':'none'}}
                    onClick={()=>setForm({...form,reportType:r.v})}
                    onMouseEnter={()=>setHov(r.v)} onMouseLeave={()=>setHov('')}
                  >
                    <span style={{fontSize:14}}>{r.icon}</span>{r.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency */}
            <div>
              <label style={{color:'#7ec8e3',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:10}}>Frequency</label>
              <div style={{display:'flex',gap:8}}>
                {FREQS.map(f=>(
                  <button key={f.v} type="button"
                    style={{flex:1,padding:'10px 8px',border:`1.5px solid ${form.frequency===f.v?'#40c4ff':'rgba(255,255,255,0.07)'}`,borderRadius:8,background:form.frequency===f.v?'rgba(64,196,255,0.15)':'rgba(255,255,255,0.03)',cursor:'pointer',transition:'all 0.2s',fontFamily:"'Nunito',sans-serif",color:form.frequency===f.v?'#40c4ff':'#a8d8ea',fontWeight:700,fontSize:12,boxShadow:form.frequency===f.v?'0 0 15px rgba(64,196,255,0.25)':'none'}}
                    onClick={()=>setForm({...form,frequency:f.v})}
                  >
                    <div style={{fontSize:20,marginBottom:4}}>{f.icon}</div>
                    <div>{f.label}</div>
                    <div style={{fontSize:10,marginTop:2,color:form.frequency===f.v?'rgba(64,196,255,0.6)':'rgba(168,216,234,0.6)'}}>{f.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Label */}
            <div>
              <label style={{color:'#7ec8e3',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:8}}>Label (optional)</label>
              <input style={{background:'rgba(255,255,255,0.04)',border:'1.5px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'10px 14px',color:'#c8e8ff',fontSize:14,fontFamily:"'Nunito',sans-serif",width:'100%',outline:'none'}}
                placeholder="e.g. Weekly CSE Attendance"
                value={form.label} onChange={e=>setForm({...form,label:e.target.value})}/>
            </div>

            {/* Email */}
            <div>
              <label style={{color:'#7ec8e3',fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.8px',display:'block',marginBottom:8}}>Delivery Email *</label>
              <input type="email" required style={{background:'rgba(255,255,255,0.04)',border:'1.5px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'10px 14px',color:'#c8e8ff',fontSize:14,fontFamily:"'Nunito',sans-serif",width:'100%',outline:'none'}}
                placeholder="your.email@vignans.edu.in"
                value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
            </div>

            {msg && <div style={{padding:'10px 14px',borderRadius:8,fontSize:13,background:msg.startsWith('✅')?'rgba(0,230,118,0.1)':'rgba(255,23,68,0.1)',border:`1px solid ${msg.startsWith('✅')?'rgba(0,230,118,0.3)':'rgba(255,23,68,0.3)'}`,color:msg.startsWith('✅')?'#69f0ae':'#ff8a80'}}>{msg}</div>}

            <button type="submit" disabled={saving}
              style={{background:'linear-gradient(135deg,#40c4ff,#0288d1)',border:'none',borderRadius:10,padding:'12px',color:'#fff',fontSize:15,fontWeight:800,cursor:'pointer',fontFamily:"'Nunito',sans-serif",transition:'all 0.25s',transform:hov==='save'?'translateY(-2px)':'none',boxShadow:hov==='save'?'0 8px 25px rgba(64,196,255,0.4)':'none'}}
              onMouseEnter={()=>setHov('save')} onMouseLeave={()=>setHov('')}
            >
              {saving?'⟳ Saving…':'📅 Save Schedule'}
            </button>
          </form>
        </div>

        {/* Existing schedules */}
        <div style={{background:'linear-gradient(145deg,#0a1628,#060e1c)',border:'1px solid rgba(64,196,255,0.12)',borderRadius:16,padding:'24px'}}>
          <div style={{color:'rgba(64,196,255,0.6)',fontSize:10,textTransform:'uppercase',letterSpacing:'1.5px',fontWeight:800,marginBottom:20}}>🗓  Active Schedules ({schedules.length})</div>
          {schedules.length===0 ? (
            <div style={{color:'#7ec8e3',textAlign:'center',padding:'40px 0',fontSize:14}}>No schedules yet.<br/><span style={{fontSize:12}}>Create one on the left →</span></div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {schedules.map(s=>{
                const rep = REPORTS.find(r=>r.v===s.reportType);
                const fr  = FREQS.find(f=>f.v===s.frequency);
                return (
                  <div key={s.id}
                    style={{background:'rgba(255,255,255,0.03)',border:`1px solid ${rep?.c||'#40c4ff'}25`,borderLeft:`3px solid ${rep?.c||'#40c4ff'}`,borderRadius:10,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',transition:'all 0.2s',':hover':{background:'rgba(255,255,255,0.06)'}}}
                    onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,0.05)';}}
                    onMouseLeave={e=>{e.currentTarget.style.background='rgba(255,255,255,0.03)';}}
                  >
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                        <span style={{fontSize:14}}>{rep?.icon||'📊'}</span>
                        <span style={{color:'#c8e8ff',fontSize:13,fontWeight:700}}>{s.label||s.reportType}</span>
                        <span style={{background:rep?.c+'20',color:rep?.c,border:`1px solid ${rep?.c}40`,fontSize:9,padding:'2px 8px',borderRadius:4,fontWeight:700}}>{s.reportType.toUpperCase()}</span>
                      </div>
                      <div style={{color:'#a8d8ea',fontSize:11}}>{fr?.icon} {fr?.label} · 📧 {s.email}</div>
                      <div style={{color:'#7ec8e3',fontSize:10,marginTop:3}}>Next: {new Date(s.nextRun).toLocaleDateString('en-IN')}</div>
                    </div>
                    <button onClick={()=>del(s.id)}
                      style={{background:'rgba(255,23,68,0.1)',border:'1px solid rgba(255,23,68,0.25)',color:'#ff8a80',borderRadius:7,padding:'5px 10px',fontSize:12,cursor:'pointer',fontFamily:"'Nunito',sans-serif",fontWeight:700,transition:'all 0.2s'}}
                      onMouseEnter={e=>{e.target.style.background='rgba(255,23,68,0.25)';}}
                      onMouseLeave={e=>{e.target.style.background='rgba(255,23,68,0.1)';}}
                    >✕ Delete</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}