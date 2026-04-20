import React from 'react';
import { cgpaColor } from './shared';

const config = {
  title: 'At-Risk Students',
  icon: '⚡',
  description: "Vignan's Foundation for Science, Technology & Research — Low CGPA · Multiple Backlogs · Chronic Low Attendance",
  filterConfig: {
    showType: true, showAcademicYear: true,
    types: [
      { value: '',               label: 'All Risk Factors'         },
      { value: 'low_cgpa',       label: 'Low CGPA (< 6.0)'        },
      { value: 'backlogs',       label: 'Multiple Backlogs (≥ 2)' },
      { value: 'low_attendance', label: 'Chronic Low Attendance'  },
    ],
  },
  columns: [
    { key: 'rollNumber',   label: 'Roll Number'  },
    { key: 'name',         label: 'Student Name' },
    { key: 'department',   label: 'Dept'         },
    { key: 'section',      label: 'Sec'          },
    { key: 'cgpa',         label: 'CGPA',
      render: r => <span style={{ color: '#ef4444', fontWeight: 700, background: '#fff1f2', padding: '2px 8px', borderRadius: 6 }}>{r.cgpa}</span>,
    },
    { key: 'backlogCount', label: 'Backlogs'     },
    { key: 'riskScore',    label: 'Risk Score',
      render: r => <span style={{ color: '#f97316', fontWeight: 700, background: '#fff7ed', padding: '2px 8px', borderRadius: 6 }}>{r.riskScore}</span>,
    },
    { key: 'riskFactors',  label: 'Risk Factors',
      render: r => <span style={{ color: '#f97316', fontSize: 11 }}>{Array.isArray(r.riskFactors) ? r.riskFactors.join(' | ') : '—'}</span>,
    },
  ],
};

export default config;
