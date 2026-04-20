import React from 'react';

const config = {
  title: 'Backlog Reports',
  icon: '⚠️',
  description: "Vignan's Foundation for Science, Technology & Research — Backlog List · Repeated Subjects · Pending Course Completions",
  filterConfig: {
    showType: true, showAcademicYear: true,
    types: [
      { value: '',         label: 'All Backlogs'              },
      { value: 'repeated', label: 'Repeated Subject Students'  },
      { value: 'pending',  label: 'Pending Credits Students'   },
    ],
  },
  columns: [
    { key: 'rollNumber',    label: 'Roll Number'  },
    { key: 'name',          label: 'Student Name' },
    { key: 'department',    label: 'Dept'         },
    { key: 'section',       label: 'Sec'          },
    { key: 'batch',         label: 'Batch'        },
    { key: 'backlogCount',  label: 'Backlogs',
      render: r => <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 14, background: '#fff1f2', padding: '2px 8px', borderRadius: 6 }}>{r.backlogCount}</span>,
    },
    { key: 'repeatedCount', label: 'Repeated Subs',
      render: r => r.repeatedCount > 0
        ? <span style={{ color: '#f97316', fontWeight: 700, background: '#fff7ed', padding: '2px 6px', borderRadius: 5 }}>{r.repeatedCount}</span>
        : <span style={{ color: '#94a3b8' }}>0</span>,
    },
    { key: 'pendingCredits', label: 'Pending Credits',
      render: r => <span style={{ color: '#8b5cf6', fontWeight: 700 }}>{r.pendingCredits || 0}</span>,
    },
    { key: 'backlogs',      label: 'Backlog Codes',
      render: r => <span style={{ color: '#64748b', fontSize: 11 }}>{r.backlogs?.slice(0, 4).join(', ') || '—'}{r.backlogs?.length > 4 ? '...' : ''}</span>,
    },
  ],
};

export default config;
