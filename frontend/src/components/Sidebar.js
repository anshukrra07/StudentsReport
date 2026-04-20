import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const NAV = [
  { id:'dashboard',  icon:'⊞', label:'Dashboard',        color:'#2563eb', bg:'#eff6ff' },
  { id:'chatbot',    icon:'💬', label:'AI Report Chatbot', color:'#7c3aed', bg:'#faf5ff' },
  { id:'student-profile', icon:'🧑‍🎓', label:'Student Profile', color:'#0f766e', bg:'#f0fdfa' },
  { id:'ai-risk',    icon:'🤖', label:'AI Risk Prediction',color:'#f97316', bg:'#fff7ed' },
  { id:'attendance', icon:'📋', label:'Attendance',        color:'#0ea5e9', bg:'#f0f9ff' },
  { id:'marks',      icon:'📊', label:'Marks & Results',   color:'#f59e0b', bg:'#fffbeb' },
  { id:'backlogs',   icon:'⚠️', label:'Backlogs',          color:'#ef4444', bg:'#fff1f2' },
  { id:'cgpa',       icon:'⭐', label:'CGPA Reports',      color:'#8b5cf6', bg:'#f5f3ff' },
  { id:'risk',       icon:'⚡', label:'At-Risk Students',  color:'#f97316', bg:'#fff7ed' },
  { id:'toppers',    icon:'🏆', label:'Top Performers',    color:'#10b981', bg:'#f0fdf4' },
  { id:'audit-log',  icon:'🧾', label:'Audit Log',         color:'#1d4ed8', bg:'#eff6ff' },
  { id:'alerts',     icon:'🔔', label:'Alerts',             color:'#0ea5e9', bg:'#f0f9ff' },
  { id:'bulk-import',icon:'📥', label:'Bulk Import',        color:'#059669', bg:'#f0fdf4' },
  { id:'schedule',   icon:'📅', label:'Schedules',         color:'#0284c7', bg:'#e0f2fe' },
];

const ROLE_STYLES = {
  admin:   { color:'#f97316', bg:'#fff7ed', border:'#fed7aa' },
  deo:     { color:'#2563eb', bg:'#eff6ff', border:'#bfdbfe' },
  hod:     { color:'#7c3aed', bg:'#faf5ff', border:'#ddd6fe' },
  faculty: { color:'#0ea5e9', bg:'#f0f9ff', border:'#bae6fd' },
};

export default function Sidebar({ active, onNav }) {
  const { user, logout } = useAuth();
  const { dark, toggle: toggleTheme } = useTheme();
  const [hov, setHov] = useState('');
  const rs = ROLE_STYLES[user?.role] || ROLE_STYLES.deo;

  return (
    <aside style={S.aside(dark)}>
      {/* Animated top bar */}
      <div style={S.topBar}/>

      {/* Logo */}
      <div style={{ ...S.logoRow, borderBottomColor: dark ? '#1f2937' : '#f1f5f9' }}>
        <div style={S.logoCircle}>
          <span style={S.logoV}>V</span>
        </div>
        <div>
          <div style={{ ...S.logoName, color: dark ? '#f8fafc' : '#1e2d4a' }}>VFSTR</div>
          <div style={S.logoSub}>Deemed to be University</div>
        </div>
      </div>

      {/* User card */}
      <div style={{ ...S.userCard, background:dark?'#13151f':rs.bg, borderColor:dark?'#2a2d3e':rs.border }}>
        <div style={{ ...S.avatar, background:`linear-gradient(135deg,${rs.color},${rs.color}aa)` }}>
          {user?.name?.charAt(0)}
        </div>
        <div style={S.userMeta}>
          <div style={{ ...S.uname, color: dark ? '#e2e8f0' : '#1e2d4a' }}>{user?.name}</div>
          <span style={{ ...S.roleBadge, background:rs.bg, color:rs.color, borderColor:rs.border }}>
            {user?.role?.toUpperCase()}
          </span>
          <div style={S.udept}>{user?.department} Dept.</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={S.nav}>
        <div style={S.navSec}>MENU</div>
        {NAV.map(item => {
          const isA = active===item.id, isH = hov===item.id;
          return (
            <button key={item.id}
              style={{
                ...S.navBtn,
                background: isA ? item.bg : isH ? (dark ? '#1f2937' : `${item.bg}80`) : 'transparent',
                borderLeft: `3px solid ${isA?item.color:'transparent'}`,
                color: isA?item.color : isH?item.color: dark?'#94a3b8':'#64748b',
                transform: isH&&!isA?'translateX(4px)':'none',
                boxShadow: isA?`2px 0 12px ${item.color}20`:'none',
              }}
              onClick={()=>onNav(item.id)}
              onMouseEnter={()=>setHov(item.id)}
              onMouseLeave={()=>setHov('')}
            >
              <span style={{ ...S.navIcon, background: isA||isH ? item.bg : (dark ? '#1f2937' : '#f1f5f9'), borderColor: isA||isH?item.color+'40':(dark ? '#334155' : '#e2e8f0'), fontSize:16 }}>
                {item.icon}
              </span>
              <span style={S.navLabel}>{item.label}</span>
              {isA && <span style={{ ...S.activePip, background:item.color, boxShadow:`0 0 6px ${item.color}` }}/>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{ ...S.foot, borderTopColor: dark ? '#1f2937' : 'var(--border)' }}>
        <div style={S.statusRow}>
          <span style={S.statusDot}/>
          <span style={S.statusTxt}>System Online</span>
        </div>
        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          onMouseEnter={()=>setHov('theme')} onMouseLeave={()=>setHov('')}
          title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          style={{
            width:'100%', border:'1.5px solid', borderRadius:8, padding:'8px 14px',
            fontSize:12, cursor:'pointer', transition:'all 0.2s', textAlign:'left',
            fontWeight:600, marginBottom:7, display:'flex', alignItems:'center', gap:8,
            background: hov==='theme' ? (dark?'#1e293b':'#f0f9ff') : 'transparent',
            borderColor: hov==='theme' ? (dark?'#334155':'#bae6fd') : '#e2e8f0',
            color: hov==='theme' ? (dark?'#7dd3fc':'#0ea5e9') : '#94a3b8',
          }}
        >
          {/* Toggle pill */}
          <div style={{
            width:36, height:20, borderRadius:10, position:'relative',
            background: dark ? 'linear-gradient(135deg,#6366f1,#818cf8)' : '#e2e8f0',
            transition:'background 0.3s', flexShrink:0,
          }}>
            <div style={{
              position:'absolute', top:3, left: dark?17:3,
              width:14, height:14, borderRadius:'50%',
              background:'#fff', transition:'left 0.25s cubic-bezier(0.34,1.56,0.64,1)',
              boxShadow:'0 1px 4px rgba(0,0,0,0.25)',
            }}/>
          </div>
          <span>{dark ? '🌙 Dark Mode' : '☀️ Light Mode'}</span>
        </button>
        <button
          style={{
            ...S.logoutBtn,
            background: hov==='out'?'#fff1f2':'transparent',
            borderColor: hov==='out'?'#fecdd3':'#e2e8f0',
            color: hov==='out'?'#ef4444':'#94a3b8',
          }}
          onClick={logout} onMouseEnter={()=>setHov('out')} onMouseLeave={()=>setHov('')}
        >
          ⊗  Sign Out
        </button>
      </div>
    </aside>
  );
}

// S is now a function so aside can react to dark mode
const S = {
  aside: (dark) => ({ width:256,height:'100vh',position:'fixed',left:0,top:0,zIndex:100,
    background:dark?'#1a1d27':'#fff',
    borderRight:`1px solid ${dark?'#2a2d3e':'#e2e8f8'}`,
    display:'flex',flexDirection:'column',
    boxShadow:dark?'4px 0 20px rgba(0,0,0,0.4)':'4px 0 20px rgba(37,99,235,0.08)',
    fontFamily:"'Plus Jakarta Sans',sans-serif" }),
  topBar: { height:4,background:'linear-gradient(90deg,#2563eb,#7c3aed,#ec4899,#f97316,#10b981)',backgroundSize:'300% 100%',animation:'gradMove 5s ease infinite' },
  logoRow: { display:'flex',alignItems:'center',gap:12,padding:'16px 18px 14px',borderBottom:'1px solid #f1f5f9' },
  logoCircle: { width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#f97316,#f59e0b)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(249,115,22,0.35)',flexShrink:0 },
  logoV: { fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,color:'#fff' },
  logoName: { fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:14,letterSpacing:'1px' },
  logoSub: { color:'#94a3b8',fontSize:10,marginTop:1 },
  userCard: { margin:'12px 12px',padding:'12px 14px',borderRadius:12,border:'1.5px solid',display:'flex',gap:11,alignItems:'center' },
  avatar: { width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:17,flexShrink:0 },
  userMeta: { flex:1,minWidth:0 },
  uname: { fontSize:13,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' },
  roleBadge: { display:'inline-block',fontSize:9,padding:'2px 8px',borderRadius:5,fontWeight:800,letterSpacing:'1px',marginTop:4,border:'1px solid' },
  udept: { color:'#94a3b8',fontSize:10,marginTop:3 },
  nav: { flex:1,overflowY:'auto',padding:'8px 10px',display:'flex',flexDirection:'column',gap:1 },
  navSec: { color:'var(--text3)',fontSize:9,letterSpacing:'1.5px',padding:'10px 8px 5px',textTransform:'uppercase',fontWeight:700 },
  navBtn: { display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'0 8px 8px 0',border:'none',cursor:'pointer',width:'100%',textAlign:'left',transition:'all 0.2s',position:'relative' },
  navIcon: { width:28,height:28,borderRadius:7,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s' },
  navLabel: { fontSize:13,fontWeight:600,flex:1 },
  activePip: { width:6,height:6,borderRadius:'50%',flexShrink:0 },
  foot: { padding:'10px 12px 16px',borderTop:'1px solid var(--border)' },
  statusRow: { display:'flex',alignItems:'center',gap:7,marginBottom:9 },
  statusDot: { width:7,height:7,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981',animation:'pulse 2s ease-in-out infinite' },
  statusTxt: { color:'#10b981',fontSize:11,fontWeight:600 },
  logoutBtn: { width:'100%',border:'1.5px solid',borderRadius:8,padding:'8px 14px',fontSize:12,cursor:'pointer',transition:'all 0.2s',textAlign:'left',fontWeight:600 },
};
