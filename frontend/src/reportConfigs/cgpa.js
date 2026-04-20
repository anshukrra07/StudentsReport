import React from 'react';
import { cgpaColor } from './shared';

const config = {
  title: 'CGPA Reports',
  icon: '⭐',
  description: "Vignan's Foundation for Science, Technology & Research — CGPA Distribution · Student Rankings · Academic Toppers",
  filterConfig: {
    showType: true, showAcademicYear: true,
    types: [
      { value: 'ranking',      label: 'Full Student Rankings'    },
      { value: 'toppers',      label: 'Top Performers'           },
      { value: 'distribution', label: 'CGPA Distribution Chart'  },
    ],
  },
  columns: [
    { key: 'rank',       label: 'Rank',
      render: r => <span style={{ color: '#f59e0b', fontWeight: 800, fontFamily: "'Sora',sans-serif" }}>#{r.rank}</span>,
    },
    { key: 'rollNumber', label: 'Roll Number' },
    { key: 'name',       label: 'Student Name' },
    { key: 'department', label: 'Dept'         },
    { key: 'batch',      label: 'Batch'        },
    { key: 'cgpa',       label: 'CGPA',
      render: r => <span style={{ color: cgpaColor(r.cgpa), fontWeight: 800, fontSize: 14, background: cgpaColor(r.cgpa) + '15', padding: '2px 8px', borderRadius: 6 }}>{r.cgpa}</span>,
    },
  ],
  columnSets: {
    distribution: [
      { key: 'label', label: 'CGPA Range' },
      { key: 'count', label: 'No. of Students',
        render: r => <span style={{ color: '#2563eb', fontWeight: 800, fontSize: 15 }}>{r.count}</span>,
      },
    ],
    ranking: [
      { key: 'rank',            label: 'Rank',
        render: r => <span style={{ color: '#f59e0b', fontWeight: 800, fontFamily: "'Sora',sans-serif", fontSize: 14 }}>#{r.rank}</span>,
      },
      { key: 'rollNumber',      label: 'Roll Number'  },
      { key: 'name',            label: 'Student Name' },
      { key: 'department',      label: 'Dept'         },
      { key: 'section',         label: 'Sec'          },
      { key: 'batch',           label: 'Batch'        },
      { key: 'currentSemester', label: 'Sem'          },
      { key: 'cgpa',            label: 'CGPA',
        render: r => <span style={{ color: cgpaColor(r.cgpa), fontWeight: 800, fontSize: 14, background: cgpaColor(r.cgpa) + '15', padding: '2px 8px', borderRadius: 6 }}>{r.cgpa}</span>,
      },
    ],
    toppers: [
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
  },
};

export default config;
