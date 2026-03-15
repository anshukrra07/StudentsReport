import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const STATS = [
  { key:'total',        label:'Total Students',   icon:'👨‍🎓', g:'linear-gradient(135deg,#2563eb,#4f46e5)', shadow:'rgba(37,99,235,0.3)',  delay:0   },
  { key:'avgCGPA',      label:'Average CGPA',     icon:'⭐', g:'linear-gradient(135deg,#f59e0b,#f97316)', shadow:'rgba(245,158,11,0.3)',  delay:80  },
  { key:'withBacklogs', label:'With Backlogs',    icon:'📌', g:'linear-gradient(135deg,#ef4444,#f97316)', shadow:'rgba(239,68,68,0.3)',   delay:160 },
  { key:'lowAttendance',label:'Low Attendance',   icon:'📉', g:'linear-gradient(135deg,#f43f5e,#ec4899)', shadow:'rgba(244,63,94,0.3)',   delay:240 },
  { key:'atRisk',       label:'At-Risk',          icon:'⚡', g:'linear-gradient(135deg,#7c3aed,#4f46e5)', shadow:'rgba(124,58,237,0.3)',  delay:320 },
  { key:'toppers',      label:'CGPA ≥ 9 Toppers', icon:'🏆', g:'linear-gradient(135deg,#10b981,#0ea5e9)', shadow:'rgba(16,185,129,0.3)',  delay:400 },
];

function StatCard({ label, value, icon, g, shadow, delay }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background: hov ? g : '#fff',
        borderRadius:16, padding:'20px 18px', cursor:'default',
        transition:'all 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        transform: hov?'translateY(-6px) scale(1.02)':'none',
        boxShadow: hov?`0 18px 40px ${shadow}`:'0 2px 10px rgba(30,58,138,0.06)',
        border: hov?'1.5px solid transparent':'1.5px solid #e2e8f8',
        animation:`fadeUp 0.5s ${delay}ms ease both`,
        position:'relative', overflow:'hidden',
      }}>
      {/* Shimmer on hover */}
      {hov && <div style={{ position:'absolute',top:0,left:'-100%',width:'60%',height:'100%',background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.15),transparent)',animation:'shimmer 0.8s ease' }}/>}
      <div style={{ fontSize:32,marginBottom:10,filter:hov?'none':'grayscale(0.2)' }}>{icon}</div>
      <div style={{ fontFamily:"'Sora',sans-serif",fontSize:32,fontWeight:800,color:hov?'#fff':'#1e2d4a',lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:12,color:hov?'rgba(255,255,255,0.8)':'#8fa0bc',marginTop:6,fontWeight:600 }}>{label}</div>
    </div>
  );
}

export default function Dashboard() {
  const { API, user } = useAuth();
  const [sum, setSum]   = useState(null);
  const [cgpa, setCgpa] = useState([]);
  const [load, setLoad] = useState(true);
  const [time, setTime] = useState(new Date());
  const [block, setBlock] = useState('all');

  useEffect(()=>{ const t=setInterval(()=>setTime(new Date()),1000); return ()=>clearInterval(t); },[]);
  useEffect(()=>{
    Promise.all([axios.get(`${API}/reports/summary`), axios.get(`${API}/reports/cgpa?type=distribution`)])
      .then(([s,c])=>{ setSum(s.data); setCgpa(c.data.distribution||[]); })
      .catch(console.error).finally(()=>setLoad(false));
  },[API]);

  if(load) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',flexDirection:'column',gap:16,background:'#f0f4ff' }}>
      <div style={{ width:48,height:48,border:'4px solid #bfdbfe',borderTop:'4px solid #2563eb',borderRadius:'50%',animation:'spin 0.8s linear infinite' }}/>
      <div style={{ color:'#2563eb',fontSize:14,fontWeight:600 }}>Loading Dashboard...</div>
    </div>
  );

  const PIE_COLORS = ['#10b981','#7c3aed','#f97316'];
  const pieData = [
    { name:'Normal',   value:Math.max(0,(sum?.total||0)-(sum?.atRisk||0)-(sum?.withBacklogs||0)) },
    { name:'At Risk',  value:sum?.atRisk||0 },
    { name:'Backlogs', value:sum?.withBacklogs||0 },
  ];
  const BAR_COLORS = ['#2563eb','#4f46e5','#7c3aed','#ec4899','#f97316','#f59e0b'];
  const BLOCKS = { all:{ img:'/campus/all.jpg', label:'Campus Aerial View' }, n:{ img:'/campus/n_block.jpg', label:'N-Block' }, h:{ img:'/campus/h_block_new.jpg', label:'H-Block' }, u:{ img:'/campus/u_block_new.jpg', label:'U-Block' } };
  const hr = time.getHours();
  const greet = hr<12?'Good Morning ☀️':hr<17?'Good Afternoon 🌤️':'Good Evening 🌙';

  return (
    <div style={{ minHeight:'100vh',background:'#f0f4ff',fontFamily:"'Plus Jakarta Sans',sans-serif" }}>

      {/* ── Hero Banner ── */}
      <div style={{ position:'relative',height:190,overflow:'hidden' }}>
        <img src="/campus/all.jpg" alt="campus" style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center 40%',filter:'brightness(0.55) saturate(1.3)' }} onError={e=>e.target.style.display='none'}/>
        <div style={{ position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(30,58,138,0.85) 0%,rgba(79,70,229,0.4) 60%,rgba(16,185,129,0.2) 100%)' }}/>
        {/* Animated color bar at bottom */}
        <div style={{ position:'absolute',bottom:0,left:0,right:0,height:4,background:'linear-gradient(90deg,#2563eb,#7c3aed,#ec4899,#f97316,#10b981)',backgroundSize:'300% 100%',animation:'gradMove 4s ease infinite' }}/>
        <div style={{ position:'absolute',inset:0,display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0 36px',zIndex:1 }}>
          <div>
            <div style={{ color:'rgba(147,197,253,0.9)',fontSize:12,fontWeight:700,letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:6 }}>Vignan's Foundation for Science, Technology & Research (Deemed to be University)</div>
            <h1 style={{ fontFamily:"'Sora',sans-serif",fontSize:28,fontWeight:800,color:'#fff',margin:0 }}>
              {greet}, <span style={{ color:'#fbbf24' }}>{user?.name?.split(' ')[0]}</span>!
            </h1>
            <p style={{ color:'rgba(255,255,255,0.6)',fontSize:13,marginTop:6 }}>
              {user?.department} Department  ·  {user?.role?.toUpperCase()} Access
            </p>
            <div style={{ display:'flex',gap:8,marginTop:10 }}>
              {['Vadlamudi, Guntur','NAAC A+','NBA Accredited'].map(t=>(
                <span key={t} style={{ background:'rgba(255,255,255,0.15)',backdropFilter:'blur(8px)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff',fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:600 }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontFamily:"'DM Mono',monospace",fontSize:32,color:'#fbbf24',fontWeight:500,letterSpacing:'3px',textShadow:'0 0 20px rgba(251,191,36,0.5)' }}>
              {time.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}
            </div>
            <div style={{ color:'rgba(255,255,255,0.5)',fontSize:12,marginTop:4 }}>
              {time.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding:'24px 28px 32px' }}>
        {/* Stats */}
        <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:14,marginBottom:22 }}>
          {STATS.map(s=><StatCard key={s.key} {...s} value={sum?.[s.key]??0}/>)}
        </div>

        {/* Charts + Campus gallery */}
        <div style={{ display:'grid',gridTemplateColumns:'1.3fr 1fr 1fr',gap:18 }}>

          {/* Bar chart */}
          <div style={cardStyle}>
            <div style={chartHead}><span style={chartTitle}>📊 CGPA Distribution</span><span style={chartSub}>All students</span></div>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={cgpa} margin={{top:5,right:5,bottom:5,left:-15}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
                <XAxis dataKey="label" tick={{fill:'#94a3b8',fontSize:10}}/>
                <YAxis tick={{fill:'#94a3b8',fontSize:10}}/>
                <Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f8',borderRadius:8,fontSize:12,boxShadow:'0 4px 15px rgba(0,0,0,0.1)'}} cursor={{fill:'rgba(37,99,235,0.05)'}}/>
                <Bar dataKey="count" radius={[6,6,0,0]}>
                  {cgpa.map((_,i)=><Cell key={i} fill={BAR_COLORS[i%BAR_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Pie chart */}
          <div style={cardStyle}>
            <div style={chartHead}><span style={chartTitle}>🍩 Student Status</span><span style={chartSub}>Overview</span></div>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" outerRadius={72} innerRadius={32} dataKey="value"
                  label={({name,percent})=>`${(percent*100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_,i)=><Cell key={i} fill={PIE_COLORS[i]}/>)}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:11}}/>
                <Tooltip contentStyle={{background:'#fff',border:'1px solid #e2e8f8',borderRadius:8,fontSize:12}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Campus block gallery */}
          <div style={cardStyle}>
            <div style={chartHead}><span style={chartTitle}>🏛️ Campus Blocks</span><span style={chartSub}>Hover to view</span></div>
            <div style={{ display:'flex',gap:6,marginBottom:10 }}>
              {Object.entries(BLOCKS).map(([k,v])=>(
                <button key={k} onClick={()=>setBlock(k)} onMouseEnter={()=>setBlock(k)}
                  style={{ flex:1,padding:'6px 0',borderRadius:8,border:`1.5px solid ${block===k?'#2563eb':'#e2e8f8'}`,background:block===k?'linear-gradient(135deg,#eff6ff,#f5f3ff)':'#f8faff',color:block===k?'#2563eb':'#94a3b8',fontSize:11,fontWeight:700,cursor:'pointer',transition:'all 0.2s' }}>
                  {v.label}
                </button>
              ))}
            </div>
            <div style={{ borderRadius:10,overflow:'hidden',height:122,position:'relative' }}>
              <img src={BLOCKS[block].img} alt={BLOCKS[block].label}
                style={{ width:'100%',height:'100%',objectFit:'cover',transition:'transform 0.4s' }}
                onError={e=>e.target.style.display='none'}
                onMouseEnter={e=>e.target.style.transform='scale(1.05)'}
                onMouseLeave={e=>e.target.style.transform='scale(1)'}
              />
              <div style={{ position:'absolute',bottom:0,left:0,right:0,background:'linear-gradient(transparent,rgba(0,0,0,0.6)',padding:'10px 12px' }}>
                <span style={{ color:'#fff',fontSize:12,fontWeight:700 }}>{BLOCKS[block].label} — VFSTR</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ marginTop:18,background:'#fff',borderRadius:16,padding:'18px 24px',border:'1px solid #e2e8f8',boxShadow:'0 2px 10px rgba(30,58,138,0.06)' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:16 }}>
            <div style={{ color:'#64748b',fontSize:13,fontWeight:600 }}>📌 Quick Insights</div>
            {[
              { label:'Pass Rate', value: sum?.total ? `${(((sum.total-sum.withBacklogs)/sum.total)*100).toFixed(1)}%` : '—', color:'#10b981' },
              { label:'Attendance OK', value: sum?.total ? `${(((sum.total-sum.lowAttendance)/sum.total)*100).toFixed(1)}%` : '—', color:'#2563eb' },
              { label:'Repeated Subjects', value: sum?.repeatedSubj||0, color:'#f97316' },
              { label:'Dept', value: user?.department, color:'#7c3aed' },
            ].map(q=>(
              <div key={q.label} style={{ display:'flex',alignItems:'center',gap:8 }}>
                <div style={{ width:10,height:10,borderRadius:'50%',background:q.color }}/>
                <span style={{ color:'#94a3b8',fontSize:12 }}>{q.label}:</span>
                <span style={{ color:q.color,fontWeight:700,fontSize:14 }}>{q.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chairman message card */}
        <div style={{ marginTop:18,background:'#fff',borderRadius:16,border:'1px solid #e2e8f8',overflow:'hidden',boxShadow:'0 2px 10px rgba(30,58,138,0.06)',display:'flex' }}>
          {/* Chairman photo */}
          <div style={{ width:200,flexShrink:0,position:'relative',overflow:'hidden' }}>
            <img src="/campus/chairman.jpg" alt="Chairman"
              style={{ width:'100%',height:'100%',objectFit:'cover',objectPosition:'center top',display:'block',transition:'transform 0.4s' }}
              onError={e=>e.target.style.display='none'}
              onMouseEnter={e=>e.target.style.transform='scale(1.04)'}
              onMouseLeave={e=>e.target.style.transform='scale(1)'}
            />
            <div style={{ position:'absolute',inset:0,background:'linear-gradient(90deg,transparent 60%,rgba(255,255,255,0.8))' }}/>
          </div>
          {/* Message */}
          <div style={{ flex:1,padding:'20px 24px',display:'flex',flexDirection:'column',justifyContent:'center' }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,marginBottom:10 }}>
              <div style={{ width:4,height:36,background:'linear-gradient(180deg,#f97316,#f59e0b)',borderRadius:4 }}/>
              <div>
                <div style={{ color:'#f97316',fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'1px' }}>Chairman's Message</div>
                <div style={{ fontFamily:"'Sora',sans-serif",color:'#1e2d4a',fontSize:18,fontWeight:800 }}>Shri Lavu Rathaiah </div>
              </div>
            </div>
            <p style={{ color:'#64748b',fontSize:13,lineHeight:1.7,margin:0 }}>
              "Education is the most powerful weapon which you can use to change the world. At Vignan's, we strive to provide world-class education and create engineers who make a difference."
            </p>
            <div style={{ marginTop:12,display:'flex',gap:8,flexWrap:'wrap' }}>
              {['NAAC A+','NBA Accredited','NIRF Ranked','Autonomous University'].map(b=>(
                <span key={b} style={{ background:'#f0f4ff',border:'1px solid #c7d2fe',color:'#4f46e5',fontSize:10,padding:'3px 10px',borderRadius:20,fontWeight:700 }}>{b}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background:'#fff',border:'1px solid #e2e8f8',borderRadius:16,padding:'18px 20px',boxShadow:'0 2px 10px rgba(30,58,138,0.06)' };
const chartHead  = { display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12 };
const chartTitle = { fontFamily:"'Sora',sans-serif",color:'#1e2d4a',fontSize:14,fontWeight:700 };
const chartSub   = { color:'#94a3b8',fontSize:11 };

