import React from 'react';

const config = {
  title: 'Top Performers',
  icon: '🏆',
  description: "Vignan's Foundation for Science, Technology & Research (Deemed to be University)",
  filterConfig: {
    showLimit: true, showAcademicYear: true,
  },
  columns: [
    { key: 'rank',            label: 'Rank',
      render: r => (
        <span style={{ fontFamily: "'Sora',sans-serif", fontWeight: 800, fontSize: r.rank <= 3 ? 18 : 13,
          color: r.rank === 1 ? '#f59e0b' : r.rank === 2 ? '#94a3b8' : r.rank === 3 ? '#cd7f32' : '#64748b' }}>
          {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
        </span>
      ),
    },
    { key: 'rollNumber',      label: 'Roll Number'  },
    { key: 'name',            label: 'Student Name' },
    { key: 'department',      label: 'Dept'         },
    { key: 'batch',           label: 'Batch'        },
    { key: 'cgpa',            label: 'CGPA',
      render: r => <span style={{ color: '#10b981', fontWeight: 800, fontSize: 15, background: '#f0fdf4', padding: '2px 8px', borderRadius: 6 }}>{r.cgpa}</span>,
    },
    { key: 'backlogs',        label: 'Backlogs'     },
    { key: 'currentSemester', label: 'Sem'          },
  ],
};

export default config;
