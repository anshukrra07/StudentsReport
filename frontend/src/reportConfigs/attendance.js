import React from 'react';
import { pctColor } from './shared';

const pctBadge = (v, bg) => (
  <span style={{ color: pctColor(v), fontWeight: 700, background: bg, padding: '2px 8px', borderRadius: 6 }}>{v}%</span>
);

const config = {
  title: 'Attendance Reports',
  icon: '📋',
  description: "Vignan's Foundation for Science, Technology & Research — Section-wise · Subject-wise · Department-wise · Low Attendance",
  filterConfig: {
    showType: true, showThreshold: true, showAcademicYear: true,
    types: [
      { value: 'section_wise',    label: 'Section-wise Attendance'   },
      { value: 'subject_wise',    label: 'Subject-wise Attendance'   },
      { value: 'department_wise', label: 'Department-wise Analysis'  },
      { value: 'low_attendance',  label: 'Low Attendance Students'   },
    ],
  },
  columns: [
    { key: 'rollNumber',     label: 'Roll Number'  },
    { key: 'name',           label: 'Student Name' },
    { key: 'department',     label: 'Dept'         },
    { key: 'section',        label: 'Sec'          },
    { key: 'batch',          label: 'Batch'        },
    { key: 'avgAttendance',  label: 'Avg Att %',
      render: r => { const v = parseFloat(r.avgAttendance || 0); return pctBadge(v, v < 75 ? '#fff1f2' : v < 65 ? '#fef3c7' : '#f0fdf4'); },
    },
    { key: 'subjects',       label: 'Subjects',
      render: r => <span style={{ color: '#2563eb', fontWeight: 600 }}>{r.subjects || r.subjectDetails?.length || 0}</span>,
    },
    { key: 'belowThreshold', label: 'Below Threshold',
      render: r => r.belowThreshold > 0
        ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{r.belowThreshold} ⚠️</span>
        : <span style={{ color: '#10b981' }}>0 ✅</span>,
    },
  ],
  columnSets: {
    section_wise: [
      { key: 'rollNumber',     label: 'Roll Number'     },
      { key: 'name',           label: 'Student Name'    },
      { key: 'department',     label: 'Dept'            },
      { key: 'section',        label: 'Sec'             },
      { key: 'batch',          label: 'Batch'           },
      { key: 'avgAttendance',  label: 'Avg Att %',
        render: r => { const v = parseFloat(r.avgAttendance || 0); return pctBadge(v, v < 75 ? '#fff1f2' : '#f0fdf4'); },
      },
      { key: 'subjects',       label: 'Subjects Tracked',
        render: r => <span style={{ color: '#2563eb', fontWeight: 600 }}>{r.subjects || 0}</span>,
      },
      { key: 'belowThreshold', label: 'Low Subjects',
        render: r => r.belowThreshold > 0
          ? <span style={{ color: '#ef4444', fontWeight: 700 }}>{r.belowThreshold} ⚠️</span>
          : <span style={{ color: '#10b981' }}>0 ✅</span>,
      },
    ],
    subject_wise: [
      { key: 'subjectCode',    label: 'Subject Code'    },
      { key: 'subjectName',    label: 'Subject Name'    },
      { key: 'semester',       label: 'Sem'             },
      { key: 'totalStudents',  label: 'Total Students'  },
      { key: 'avgPercentage',  label: 'Avg %',
        render: r => <span style={{ color: pctColor(r.avgPercentage), fontWeight: 700 }}>{r.avgPercentage}%</span>,
      },
      { key: 'belowThreshold', label: 'Below Threshold',
        render: r => <span style={{ color: '#ef4444', fontWeight: 700 }}>{r.belowThreshold}</span>,
      },
    ],
    department_wise: [
      { key: 'department',     label: 'Department'      },
      { key: 'totalStudents',  label: 'Total Students'  },
      { key: 'avgAttendance',  label: 'Avg Attendance %',
        render: r => <span style={{ color: pctColor(r.avgAttendance), fontWeight: 700 }}>{r.avgAttendance}%</span>,
      },
      { key: 'belowThreshold', label: 'Below Threshold',
        render: r => <span style={{ color: '#ef4444', fontWeight: 700 }}>{r.belowThreshold}</span>,
      },
    ],
    low_attendance: [
      { key: 'rollNumber',  label: 'Roll Number'  },
      { key: 'name',        label: 'Student Name' },
      { key: 'department',  label: 'Dept'         },
      { key: 'section',     label: 'Sec'          },
      { key: 'batch',       label: 'Batch'        },
      { key: 'lowestPct',   label: 'Lowest Att %',
        render: r => <span style={{ color: '#ef4444', fontWeight: 700, background: '#fff1f2', padding: '2px 8px', borderRadius: 6 }}>{r.lowestPct}%</span>,
      },
      { key: 'lowSubjects', label: 'Low Subjects',
        render: r => <span style={{ color: '#f97316', fontWeight: 700 }}>{r.lowSubjects?.length || 0} subject(s)</span>,
      },
    ],
  },
};

export default config;
