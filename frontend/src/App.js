import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Chatbot from './pages/Chatbot';
import SchedulePage from './pages/SchedulePage';
import RiskPrediction from './pages/RiskPrediction';
import Sidebar from './components/Sidebar';
import ReportPage from './components/ReportPage';

// ── Color helpers ──────────────────────────────────────────────────────────
const cgpaColor  = v => parseFloat(v)>=8?'#10b981':parseFloat(v)>=6?'#f59e0b':'#ef4444';
const pctColor   = v => parseFloat(v)>=75?'#10b981':parseFloat(v)>=65?'#f59e0b':'#ef4444';
const passColor  = v => parseFloat(v)>=75?'#10b981':'#f59e0b';

// ── Column sets for every report sub-type ─────────────────────────────────
const CFGS = {

  // ── ATTENDANCE ──────────────────────────────────────────────────────────
  attendance: {
    title:'Attendance Reports', icon:'📋',
    description:"Vignan's Foundation for Science, Technology & Research — Section-wise · Subject-wise · Department-wise · Low Attendance",
    filterConfig:{ showType:true, showThreshold:true, showAcademicYear:true, types:[
      { value:'section_wise',    label:'Section-wise Attendance'    },
      { value:'subject_wise',    label:'Subject-wise Attendance'    },
      { value:'department_wise', label:'Department-wise Analysis'   },
      { value:'low_attendance',  label:'Low Attendance Students'    },
    ]},
    // Default columns (section_wise)
    columns:[
      { key:'rollNumber',     label:'Roll Number' },
      { key:'name',           label:'Student Name' },
      { key:'department',     label:'Dept' },
      { key:'section',        label:'Sec' },
      { key:'batch',          label:'Batch' },
      { key:'avgAttendance',  label:'Avg Att %',
        render:r => { const v=parseFloat(r.avgAttendance||0);
          return <span style={{color:pctColor(v),fontWeight:700,background:parseFloat(v)<75?'#fff1f2':parseFloat(v)<65?'#fef3c7':'#f0fdf4',padding:'2px 8px',borderRadius:6}}>{v}%</span>; }
      },
      { key:'subjects',       label:'Subjects',
        render:r => <span style={{color:'#2563eb',fontWeight:600}}>{r.subjects||r.subjectDetails?.length||0}</span>
      },
      { key:'belowThreshold', label:'Below Threshold',
        render:r => r.belowThreshold>0
          ? <span style={{color:'#ef4444',fontWeight:700}}>{r.belowThreshold} ⚠️</span>
          : <span style={{color:'#10b981'}}>0 ✅</span>
      },
    ],
    columnSets:{
      subject_wise:[
        { key:'subjectCode',    label:'Subject Code' },
        { key:'subjectName',    label:'Subject Name' },
        { key:'semester',       label:'Sem' },
        { key:'totalStudents',  label:'Total Students' },
        { key:'avgPercentage',  label:'Avg %',
          render:r=><span style={{color:pctColor(r.avgPercentage),fontWeight:700}}>{r.avgPercentage}%</span>
        },
        { key:'belowThreshold', label:'Below Threshold',
          render:r=><span style={{color:'#ef4444',fontWeight:700}}>{r.belowThreshold}</span>
        },
      ],
      department_wise:[
        { key:'department',     label:'Department' },
        { key:'totalStudents',  label:'Total Students' },
        { key:'avgAttendance',  label:'Avg Attendance %',
          render:r=><span style={{color:pctColor(r.avgAttendance),fontWeight:700}}>{r.avgAttendance}%</span>
        },
        { key:'belowThreshold', label:'Below Threshold',
          render:r=><span style={{color:'#ef4444',fontWeight:700}}>{r.belowThreshold}</span>
        },
      ],
      low_attendance:[
        { key:'rollNumber',  label:'Roll Number' },
        { key:'name',        label:'Student Name' },
        { key:'department',  label:'Dept' },
        { key:'section',     label:'Sec' },
        { key:'batch',       label:'Batch' },
        { key:'lowestPct',   label:'Lowest Att %',
          render:r=><span style={{color:'#ef4444',fontWeight:700,background:'#fff1f2',padding:'2px 8px',borderRadius:6}}>{r.lowestPct}%</span>
        },
        { key:'lowSubjects', label:'Low Subjects',
          render:r=><span style={{color:'#f97316',fontWeight:700}}>{r.lowSubjects?.length||0} subject(s)</span>
        },
      ],
      section_wise:[
        { key:'rollNumber',     label:'Roll Number' },
        { key:'name',           label:'Student Name' },
        { key:'department',     label:'Dept' },
        { key:'section',        label:'Sec' },
        { key:'batch',          label:'Batch' },
        { key:'avgAttendance',  label:'Avg Att %',
          render:r=>{const v=parseFloat(r.avgAttendance||0);
            return <span style={{color:pctColor(v),fontWeight:700,background:v<75?'#fff1f2':'#f0fdf4',padding:'2px 8px',borderRadius:6}}>{v}%</span>;}
        },
        { key:'subjects',       label:'Subjects Tracked',
          render:r=><span style={{color:'#2563eb',fontWeight:600}}>{r.subjects||0}</span>
        },
        { key:'belowThreshold', label:'Low Subjects',
          render:r=>r.belowThreshold>0
            ?<span style={{color:'#ef4444',fontWeight:700}}>{r.belowThreshold} ⚠️</span>
            :<span style={{color:'#10b981'}}>0 ✅</span>
        },
      ],
    },
  },

  // ── MARKS ───────────────────────────────────────────────────────────────
  marks: {
    title:'Marks & Results', icon:'📊',
    description:"Vignan's Foundation for Science, Technology & Research — Internal · External · Semester Results · Subject Performance",
    filterConfig:{ showType:true, showAcademicYear:true, types:[
      { value:'external',            label:'External Marks Report'      },
      { value:'internal',            label:'Internal Marks Report'      },
      { value:'semester_summary',    label:'Semester Result Summary'    },
      { value:'subject_performance', label:'Subject Performance Analysis'},
    ]},
    columns:[
      { key:'rollNumber', label:'Roll Number' },
      { key:'name',       label:'Student Name' },
      { key:'department', label:'Dept' },
      { key:'section',    label:'Sec' },
      { key:'batch',      label:'Batch' },
      { key:'cgpa',       label:'CGPA',
        render:r=><span style={{color:cgpaColor(r.cgpa),fontWeight:700,background:cgpaColor(r.cgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
      },
      { key:'semesters',  label:'Sems Recorded',
        render:r=><span style={{color:'#2563eb',fontWeight:600}}>{r.semesters?.length||0}</span>
      },
    ],
    columnSets:{
      internal:[
        { key:'rollNumber', label:'Roll Number' },
        { key:'name',       label:'Student Name' },
        { key:'department', label:'Dept' },
        { key:'section',    label:'Sec' },
        { key:'batch',      label:'Batch' },
        { key:'cgpa',       label:'CGPA',
          render:r=><span style={{color:cgpaColor(r.cgpa),fontWeight:700,background:cgpaColor(r.cgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
        },
        { key:'semesters',  label:'Sems Recorded',
          render:r=><span style={{color:'#2563eb',fontWeight:600}}>{r.semesters?.length||0}</span>
        },
      ],
      external:[
        { key:'rollNumber', label:'Roll Number' },
        { key:'name',       label:'Student Name' },
        { key:'department', label:'Dept' },
        { key:'section',    label:'Sec' },
        { key:'batch',      label:'Batch' },
        { key:'cgpa',       label:'CGPA',
          render:r=><span style={{color:cgpaColor(r.cgpa),fontWeight:700,background:cgpaColor(r.cgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
        },
        { key:'semesters',  label:'Sems Recorded',
          render:r=><span style={{color:'#2563eb',fontWeight:600}}>{r.semesters?.length||0}</span>
        },
      ],
      semester_summary:[
        { key:'semester',      label:'Semester',
          render:r=><span style={{color:'#4f46e5',fontWeight:800,fontFamily:"'Sora',sans-serif"}}>Sem {r.semester}</span>
        },
        { key:'academicYear',  label:'Academic Year' },
        { key:'totalStudents', label:'Total',
          render:r=><span style={{color:'#1e2d4a',fontWeight:700}}>{r.totalStudents}</span>
        },
        { key:'pass',          label:'Pass ✅',
          render:r=><span style={{color:'#10b981',fontWeight:700,background:'#f0fdf4',padding:'2px 8px',borderRadius:6}}>{r.pass}</span>
        },
        { key:'fail',          label:'Fail ❌',
          render:r=><span style={{color:'#ef4444',fontWeight:700,background:'#fff1f2',padding:'2px 8px',borderRadius:6}}>{r.fail}</span>
        },
        { key:'detained',      label:'Detained',
          render:r=><span style={{color:'#f97316',fontWeight:700}}>{r.detained||0}</span>
        },
        { key:'avgSgpa',       label:'Avg SGPA',
          render:r=><span style={{color:cgpaColor(r.avgSgpa),fontWeight:700,background:cgpaColor(r.avgSgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.avgSgpa}</span>
        },
        { key:'passPercent',   label:'Pass %',
          render:r=><span style={{color:passColor(r.passPercent),fontWeight:700}}>{r.passPercent}%</span>
        },
      ],
      subject_performance:[
        { key:'subjectCode',  label:'Subject Code' },
        { key:'subjectName',  label:'Subject Name' },
        { key:'semester',     label:'Sem' },
        { key:'avgTotal',     label:'Avg Total',
          render:r=><span style={{color:'#2563eb',fontWeight:700}}>{r.avgTotal}</span>
        },
        { key:'passCount',    label:'Pass',
          render:r=><span style={{color:'#10b981',fontWeight:700,background:'#f0fdf4',padding:'2px 6px',borderRadius:5}}>{r.passCount}</span>
        },
        { key:'failCount',    label:'Fail',
          render:r=><span style={{color:'#ef4444',fontWeight:700,background:'#fff1f2',padding:'2px 6px',borderRadius:5}}>{r.failCount}</span>
        },
        { key:'passRate',     label:'Pass Rate',
          render:r=><span style={{color:passColor(r.passRate),fontWeight:700}}>{r.passRate}%</span>
        },
      ],
    },
  },

  // ── BACKLOGS ─────────────────────────────────────────────────────────────
  backlogs:{
    title:'Backlog Reports', icon:'⚠️',
    description:"Vignan's Foundation for Science, Technology & Research — Backlog List · Repeated Subjects · Pending Course Completions",
    filterConfig:{ showType:true, showAcademicYear:true, types:[
      { value:'',         label:'All Backlogs'             },
      { value:'repeated', label:'Repeated Subject Students' },
      { value:'pending',  label:'Pending Credits Students'  },
    ]},
    columns:[
      { key:'rollNumber',    label:'Roll Number' },
      { key:'name',          label:'Student Name' },
      { key:'department',    label:'Dept' },
      { key:'section',       label:'Sec' },
      { key:'batch',         label:'Batch' },
      { key:'backlogCount',  label:'Backlogs',
        render:r=><span style={{color:'#ef4444',fontWeight:800,fontSize:14,background:'#fff1f2',padding:'2px 8px',borderRadius:6}}>{r.backlogCount}</span>
      },
      { key:'repeatedCount', label:'Repeated Subs',
        render:r=>r.repeatedCount>0
          ?<span style={{color:'#f97316',fontWeight:700,background:'#fff7ed',padding:'2px 6px',borderRadius:5}}>{r.repeatedCount}</span>
          :<span style={{color:'#94a3b8'}}>0</span>
      },
      { key:'pendingCredits',label:'Pending Credits',
        render:r=><span style={{color:'#8b5cf6',fontWeight:700}}>{r.pendingCredits||0}</span>
      },
      { key:'backlogs',      label:'Backlog Codes',
        render:r=><span style={{color:'#64748b',fontSize:11}}>{r.backlogs?.slice(0,4).join(', ')||'—'}{r.backlogs?.length>4?'...':''}</span>
      },
    ],
  },

  // ── CGPA ─────────────────────────────────────────────────────────────────
  cgpa:{
    title:'CGPA Reports', icon:'⭐',
    description:"Vignan's Foundation for Science, Technology & Research — CGPA Distribution · Student Rankings · Academic Toppers",
    filterConfig:{ showType:true, showAcademicYear:true, types:[
      { value:'ranking',      label:'Full Student Rankings'    },
      { value:'toppers',      label:'Top Performers'           },
      { value:'distribution', label:'CGPA Distribution Chart' },
    ]},
    columns:[
      { key:'rank',       label:'Rank',
        render:r=><span style={{color:'#f59e0b',fontWeight:800,fontFamily:"'Sora',sans-serif"}}>#{r.rank}</span>
      },
      { key:'rollNumber', label:'Roll Number' },
      { key:'name',       label:'Student Name' },
      { key:'department', label:'Dept' },
      { key:'batch',      label:'Batch' },
      { key:'cgpa',       label:'CGPA',
        render:r=><span style={{color:cgpaColor(r.cgpa),fontWeight:800,fontSize:14,background:cgpaColor(r.cgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
      },
    ],
    columnSets:{
      distribution:[
        { key:'label', label:'CGPA Range' },
        { key:'count', label:'No. of Students',
          render:r=><span style={{color:'#2563eb',fontWeight:800,fontSize:15}}>{r.count}</span>
        },
      ],
      ranking:[
        { key:'rank',              label:'Rank',
          render:r=><span style={{color:'#f59e0b',fontWeight:800,fontFamily:"'Sora',sans-serif",fontSize:14}}>#{r.rank}</span>
        },
        { key:'rollNumber',        label:'Roll Number' },
        { key:'name',              label:'Student Name' },
        { key:'department',        label:'Dept' },
        { key:'section',           label:'Sec' },
        { key:'batch',             label:'Batch' },
        { key:'currentSemester',   label:'Sem' },
        { key:'cgpa',              label:'CGPA',
          render:r=><span style={{color:cgpaColor(r.cgpa),fontWeight:800,fontSize:14,background:cgpaColor(r.cgpa)+'15',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
        },
      ],
      toppers:[
        { key:'rank',            label:'Rank',
          render:r=><span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:r.rank<=3?18:13,color:r.rank===1?'#f59e0b':r.rank===2?'#94a3b8':r.rank===3?'#cd7f32':'#64748b'}}>
            {r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':`#${r.rank}`}
          </span>
        },
        { key:'rollNumber',      label:'Roll Number' },
        { key:'name',            label:'Student Name' },
        { key:'department',      label:'Dept' },
        { key:'batch',           label:'Batch' },
        { key:'cgpa',            label:'CGPA',
          render:r=><span style={{color:'#10b981',fontWeight:800,fontSize:15,background:'#f0fdf4',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
        },
        { key:'backlogs',        label:'Backlogs' },
        { key:'currentSemester', label:'Sem' },
      ],
    },
  },

  // ── RISK ─────────────────────────────────────────────────────────────────
  risk:{
    title:'At-Risk Students', icon:'⚡',
    description:"Vignan's Foundation for Science, Technology & Research — Low CGPA · Multiple Backlogs · Chronic Low Attendance",
    filterConfig:{ showType:true, showAcademicYear:true, types:[
      { value:'',              label:'All Risk Factors'           },
      { value:'low_cgpa',      label:'Low CGPA (< 6.0)'          },
      { value:'backlogs',      label:'Multiple Backlogs (≥ 2)'   },
      { value:'low_attendance',label:'Chronic Low Attendance'    },
    ]},
    columns:[
      { key:'rollNumber',   label:'Roll Number' },
      { key:'name',         label:'Student Name' },
      { key:'department',   label:'Dept' },
      { key:'section',      label:'Sec' },
      { key:'cgpa',         label:'CGPA',
        render:r=><span style={{color:'#ef4444',fontWeight:700,background:'#fff1f2',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
      },
      { key:'backlogCount', label:'Backlogs' },
      { key:'riskScore',    label:'Risk Score',
        render:r=><span style={{color:'#f97316',fontWeight:700,background:'#fff7ed',padding:'2px 8px',borderRadius:6}}>{r.riskScore}</span>
      },
      { key:'riskFactors',  label:'Risk Factors',
        render:r=><span style={{color:'#f97316',fontSize:11}}>{Array.isArray(r.riskFactors)?r.riskFactors.join(' | '):'—'}</span>
      },
    ],
  },

  // ── TOPPERS ──────────────────────────────────────────────────────────────
  toppers:{
    title:'Top Performers', icon:'🏆',
    description:"Vignan's Foundation for Science, Technology & Research (Deemed to be University)",
    filterConfig:{ showLimit:true, showAcademicYear:true },
    columns:[
      { key:'rank',            label:'Rank',
        render:r=><span style={{fontFamily:"'Sora',sans-serif",fontWeight:800,fontSize:r.rank<=3?18:13,color:r.rank===1?'#f59e0b':r.rank===2?'#94a3b8':r.rank===3?'#cd7f32':'#64748b'}}>
          {r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':`#${r.rank}`}
        </span>
      },
      { key:'rollNumber',      label:'Roll Number' },
      { key:'name',            label:'Student Name' },
      { key:'department',      label:'Dept' },
      { key:'batch',           label:'Batch' },
      { key:'cgpa',            label:'CGPA',
        render:r=><span style={{color:'#10b981',fontWeight:800,fontSize:15,background:'#f0fdf4',padding:'2px 8px',borderRadius:6}}>{r.cgpa}</span>
      },
      { key:'backlogs',        label:'Backlogs' },
      { key:'currentSemester', label:'Sem' },
    ],
  },
};

function AppContent() {
  const { user, loading } = useAuth();
  const [page, setPage] = useState('dashboard');

  useEffect(() => {
    const handler = e => setPage(e.detail);
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  if(loading) return (
    <div style={{background:'#f0f4ff',height:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <div style={{position:'relative',width:60,height:60}}>
        <div style={{position:'absolute',inset:0,borderRadius:'50%',border:'4px solid #bfdbfe',borderTop:'4px solid #2563eb',animation:'spin 0.9s linear infinite'}}/>
        <div style={{position:'absolute',inset:10,borderRadius:'50%',border:'3px solid #ddd6fe',borderBottom:'3px solid #7c3aed',animation:'spin 1.4s linear infinite reverse'}}/>
      </div>
      <div style={{color:'#2563eb',fontSize:13,fontWeight:700}}>Loading VFSTR Portal...</div>
    </div>
  );

  if(!user) return <LoginPage/>;

  return (
    <div style={{display:'flex',background:'#f0f4ff',minHeight:'100vh',fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
      <Sidebar active={page} onNav={setPage}/>
      <main style={{marginLeft:256,flex:1,overflowY:'auto',minHeight:'100vh'}}>
        {page==='dashboard'   ? <Dashboard/>
        :page==='chatbot'     ? <Chatbot/>
        :page==='schedule'    ? <SchedulePage/>
        :page==='ai-risk'     ? <RiskPrediction/>
        :CFGS[page]           ? <ReportPage reportType={page} {...CFGS[page]}/>
        :<Dashboard/>}
      </main>
    </div>
  );
}

export default function App(){ return <AuthProvider><AppContent/></AuthProvider>; }