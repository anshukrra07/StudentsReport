import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { id:'dashboard',  icon:'⊞', label:'Dashboard',        color:'#2563eb', bg:'#eff6ff' },
  { id:'chatbot',    icon:'💬', label:'AI Report Chatbot', color:'#7c3aed', bg:'#faf5ff' },
  { id:'ai-risk',    icon:'🤖', label:'AI Risk Prediction',color:'#f97316', bg:'#fff7ed' },
  { id:'attendance', icon:'📋', label:'Attendance',        color:'#0ea5e9', bg:'#f0f9ff' },
  { id:'marks',      icon:'📊', label:'Marks & Results',   color:'#f59e0b', bg:'#fffbeb' },
  { id:'backlogs',   icon:'⚠️', label:'Backlogs',          color:'#ef4444', bg:'#fff1f2' },
  { id:'cgpa',       icon:'⭐', label:'CGPA Reports',      color:'#8b5cf6', bg:'#f5f3ff' },
  { id:'risk',       icon:'⚡', label:'At-Risk Students',  color:'#f97316', bg:'#fff7ed' },
  { id:'toppers',    icon:'🏆', label:'Top Performers',    color:'#10b981', bg:'#f0fdf4' },
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
  const [hov, setHov] = useState('');
  const rs = ROLE_STYLES[user?.role] || ROLE_STYLES.deo;

  return (
    <aside style={S.aside}>
      {/* Animated top bar */}
      <div style={S.topBar}/>

      {/* Logo */}
      <div style={S.logoRow}>
        <div style={S.logoCircle}>
          <span style={S.logoV}>V</span>
        </div>
        <div>
          <div style={S.logoName}>VFSTR</div>
          <div style={S.logoSub}>Deemed to be University</div>
        </div>
      </div>

      {/* User card */}
      <div style={{ ...S.userCard, background:rs.bg, borderColor:rs.border }}>
        <div style={{ ...S.avatar, background:`linear-gradient(135deg,${rs.color},${rs.color}aa)` }}>
          {user?.name?.charAt(0)}
        </div>
        <div style={S.userMeta}>
          <div style={S.uname}>{user?.name}</div>
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
                background: isA?item.bg : isH?item.bg+'80':'transparent',
                borderLeft: `3px solid ${isA?item.color:'transparent'}`,
                color: isA?item.color : isH?item.color:'#64748b',
                transform: isH&&!isA?'translateX(4px)':'none',
                boxShadow: isA?`2px 0 12px ${item.color}20`:'none',
              }}
              onClick={()=>onNav(item.id)}
              onMouseEnter={()=>setHov(item.id)}
              onMouseLeave={()=>setHov('')}
            >
              <span style={{ ...S.navIcon, background: isA||isH?item.bg:'#f1f5f9', borderColor: isA||isH?item.color+'40':'#e2e8f0', fontSize:16 }}>
                {item.icon}
              </span>
              <span style={S.navLabel}>{item.label}</span>
              {isA && <span style={{ ...S.activePip, background:item.color, boxShadow:`0 0 6px ${item.color}` }}/>}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={S.foot}>
        <div style={S.statusRow}>
          <span style={S.statusDot}/>
          <span style={S.statusTxt}>System Online</span>
        </div>
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

const S = {
  aside: { width:256,height:'100vh',position:'fixed',left:0,top:0,zIndex:100,background:'#fff',borderRight:'1px solid #e2e8f8',display:'flex',flexDirection:'column',boxShadow:'4px 0 20px rgba(37,99,235,0.08)',fontFamily:"'Plus Jakarta Sans',sans-serif" },
  topBar: { height:4,background:'linear-gradient(90deg,#2563eb,#7c3aed,#ec4899,#f97316,#10b981)',backgroundSize:'300% 100%',animation:'gradMove 5s ease infinite' },
  logoRow: { display:'flex',alignItems:'center',gap:12,padding:'16px 18px 14px',borderBottom:'1px solid #f1f5f9' },
  logoCircle: { width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#f97316,#f59e0b)',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 4px 12px rgba(249,115,22,0.35)',flexShrink:0 },
  logoV: { fontFamily:"'Sora',sans-serif",fontSize:22,fontWeight:800,color:'#fff' },
  logoName: { fontFamily:"'Sora',sans-serif",color:'#1e2d4a',fontWeight:800,fontSize:14,letterSpacing:'1px' },
  logoSub: { color:'#94a3b8',fontSize:10,marginTop:1 },
  userCard: { margin:'12px 12px',padding:'12px 14px',borderRadius:12,border:'1.5px solid',display:'flex',gap:11,alignItems:'center' },
  avatar: { width:38,height:38,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:800,fontSize:17,flexShrink:0 },
  userMeta: { flex:1,minWidth:0 },
  uname: { color:'#1e2d4a',fontSize:13,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' },
  roleBadge: { display:'inline-block',fontSize:9,padding:'2px 8px',borderRadius:5,fontWeight:800,letterSpacing:'1px',marginTop:4,border:'1px solid' },
  udept: { color:'#94a3b8',fontSize:10,marginTop:3 },
  nav: { flex:1,overflowY:'auto',padding:'8px 10px',display:'flex',flexDirection:'column',gap:1 },
  navSec: { color:'#cbd5e1',fontSize:9,letterSpacing:'1.5px',padding:'10px 8px 5px',textTransform:'uppercase',fontWeight:700 },
  navBtn: { display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'0 8px 8px 0',border:'none',cursor:'pointer',width:'100%',textAlign:'left',transition:'all 0.2s',position:'relative' },
  navIcon: { width:28,height:28,borderRadius:7,border:'1px solid',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.2s' },
  navLabel: { fontSize:13,fontWeight:600,flex:1 },
  activePip: { width:6,height:6,borderRadius:'50%',flexShrink:0 },
  foot: { padding:'10px 12px 16px',borderTop:'1px solid #f1f5f9' },
  statusRow: { display:'flex',alignItems:'center',gap:7,marginBottom:9 },
  statusDot: { width:7,height:7,borderRadius:'50%',background:'#10b981',boxShadow:'0 0 8px #10b981',animation:'pulse 2s ease-in-out infinite' },
  statusTxt: { color:'#10b981',fontSize:11,fontWeight:600 },
  logoutBtn: { width:'100%',border:'1.5px solid',borderRadius:8,padding:'8px 14px',fontSize:12,cursor:'pointer',transition:'all 0.2s',textAlign:'left',fontWeight:600 },
};