import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { useAuth } from '../context/AuthContext';

const PAGE_ACCENT = '#0f766e';
const PAGE_BG = '#ecfeff';
const PAGE_BORDER = '#99f6e4';

function cardStyle(borderColor = '#e2e8f8', bg = '#fff') {
  return {
    background: bg,
    border: `1.5px solid ${borderColor}`,
    borderRadius: 16,
    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
  };
}

function summaryCard(label, value, sub, accent, bg) {
  return { label, value, sub, accent, bg };
}

export default function StudentProfilePage() {
  const { API, user } = useAuth();
  const [meta, setMeta] = useState({ departments: [], batches: [], sections: [] });
  const [filters, setFilters] = useState({});
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedRoll, setSelectedRoll] = useState('');
  const [profile, setProfile] = useState(null);
  const [listLoading, setListLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');

  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    axios.get(`${API}/students/meta`).then(res => setMeta(res.data)).catch(() => {});
  }, [API]);

  useEffect(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.append(key, value);
    });

    setListLoading(true);
    axios.get(`${API}/students?${params.toString()}`)
      .then(res => {
        setStudents(res.data || []);
        if (selectedRoll && !res.data.some(student => student.rollNumber === selectedRoll)) {
          setSelectedRoll('');
          setProfile(null);
        }
      })
      .catch(() => setStudents([]))
      .finally(() => setListLoading(false));
  }, [API, filters, selectedRoll]);

  useEffect(() => {
    if (!selectedRoll) return;

    const params = new URLSearchParams();
    if (filters.department) params.append('department', filters.department);

    setProfileLoading(true);
    setError('');
    axios.get(`${API}/students/profile/${selectedRoll}?${params.toString()}`)
      .then(res => setProfile(res.data))
      .catch(err => {
        setProfile(null);
        setError(err.response?.data?.message || 'Failed to load student profile.');
      })
      .finally(() => setProfileLoading(false));
  }, [API, selectedRoll, filters.department]);

  const filteredStudents = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    if (!term) return students;
    return students.filter(student =>
      [student.rollNumber, student.name, student.section, student.batch]
        .some(value => String(value || '').toLowerCase().includes(term))
    );
  }, [students, deferredSearch]);

  const attendanceChart = useMemo(() => {
    if (!profile?.attendanceHistory) return [];
    return profile.attendanceHistory.map(item => ({
      label: `S${item.semester} ${item.subjectCode}`,
      percentage: item.percentage,
    }));
  }, [profile]);

  const marksChart = useMemo(() => {
    if (!profile?.marksHistory) return [];
    return profile.marksHistory.map(item => ({
      label: `S${item.semester} ${item.subjectCode}`,
      total: item.total,
    }));
  }, [profile]);

  const summaryCards = profile ? [
    summaryCard('Current CGPA', profile.student.cgpa, `${profile.student.department} · ${profile.student.batch}`, '#0f766e', '#f0fdfa'),
    summaryCard('Avg Attendance', `${profile.overview.avgAttendance}%`, `${profile.overview.lowAttendanceSubjects} subjects below 75%`, '#0284c7', '#eff6ff'),
    summaryCard('Active Backlogs', profile.overview.totalBacklogs, profile.overview.activeBacklogs.join(', ') || 'No active backlogs', '#ef4444', '#fff1f2'),
    summaryCard('Completed Semesters', profile.overview.completedSemesters, `${profile.overview.passedSemesters} semesters passed`, '#7c3aed', '#faf5ff'),
  ] : [];

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ position: 'relative', height: 170, overflow: 'hidden' }}>
        <img
          src="/campus/h_block_new.jpg"
          alt="campus"
          style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.45) saturate(1.1)' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(6,78,59,0.94) 0%,rgba(15,118,110,0.18) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#0f766e,#06b6d4,#0f766e)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '40px 28px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, color: '#fff', boxShadow: '0 10px 30px rgba(6,95,70,0.35)' }}>
            🧑‍🎓
          </div>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontFamily: "'Sora',sans-serif", fontSize: 24, fontWeight: 800 }}>Student Profile</h2>
            <p style={{ marginTop: 6, color: 'rgba(255,255,255,0.68)', fontSize: 13 }}>
              Drill into one student’s full academic journey: semesters, marks, attendance, and backlog history.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '24px 28px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
          <div style={{ ...cardStyle(PAGE_BORDER, '#fff'), padding: 18, position: 'sticky', top: 18 }}>
            <div style={{ color: PAGE_ACCENT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
              Student Finder
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {user?.role === 'admin' && (
                <SelectField label="Department" value={filters.department || ''} onChange={value => setFilters(prev => ({ ...prev, department: value }))}>
                  <option value="">All Departments</option>
                  {meta.departments.map(department => <option key={department} value={department}>{department}</option>)}
                </SelectField>
              )}

              <SelectField label="Batch" value={filters.batch || ''} onChange={value => setFilters(prev => ({ ...prev, batch: value }))}>
                <option value="">All Batches</option>
                {meta.batches.map(batch => <option key={batch} value={batch}>{batch}</option>)}
              </SelectField>

              <SelectField label="Section" value={filters.section || ''} onChange={value => setFilters(prev => ({ ...prev, section: value }))}>
                <option value="">All Sections</option>
                {meta.sections.map(section => <option key={section} value={section}>{section}</option>)}
              </SelectField>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ color: PAGE_ACCENT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Search</label>
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Roll number or name"
                  style={{ background: '#f8fafc', border: '1.5px solid #dbeafe', borderRadius: 10, padding: '10px 12px', outline: 'none', fontSize: 13, color: '#1e293b' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#0f172a', fontWeight: 700, fontSize: 13 }}>Students</span>
                <span style={{ color: '#64748b', fontSize: 12 }}>{filteredStudents.length}</span>
              </div>
              <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                {listLoading ? (
                  <EmptyState text="Loading students..." />
                ) : filteredStudents.length === 0 ? (
                  <EmptyState text="No students match the current filters." />
                ) : (
                  filteredStudents.map(student => {
                    const active = selectedRoll === student.rollNumber;
                    return (
                      <button
                        key={student.rollNumber}
                        onClick={() => setSelectedRoll(student.rollNumber)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          border: 'none',
                          borderLeft: `3px solid ${active ? PAGE_ACCENT : 'transparent'}`,
                          borderBottom: '1px solid #eef2f7',
                          padding: '12px 14px',
                          background: active ? PAGE_BG : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.18s',
                        }}
                      >
                        <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 13 }}>{student.rollNumber}</div>
                        <div style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>{student.name}</div>
                        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                          {student.department} · Section {student.section} · Sem {student.currentSemester}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 20 }}>
            {!selectedRoll && !profileLoading && (
              <div style={{ ...cardStyle(PAGE_BORDER, '#fff'), padding: 28 }}>
                <div style={{ color: PAGE_ACCENT, fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Select a student</div>
                <p style={{ margin: 0, color: '#64748b', fontSize: 14, lineHeight: 1.7 }}>
                  Choose a student from the finder to load their semester-wise journey, subject marks history, attendance progression, and backlog status.
                </p>
              </div>
            )}

            {profileLoading && (
              <div style={{ ...cardStyle(PAGE_BORDER, '#fff'), padding: 28 }}>
                <div style={{ color: PAGE_ACCENT, fontWeight: 700 }}>Loading profile...</div>
              </div>
            )}

            {error && (
              <div style={{ ...cardStyle('#fecaca', '#fff1f2'), padding: 18, color: '#b91c1c', fontWeight: 700 }}>{error}</div>
            )}

            {profile && !profileLoading && (
              <>
                <div style={{ ...cardStyle(PAGE_BORDER, '#fff'), padding: 22 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: PAGE_ACCENT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                        Student Snapshot
                      </div>
                      <h3 style={{ margin: 0, color: '#0f172a', fontFamily: "'Sora',sans-serif", fontSize: 24 }}>{profile.student.name}</h3>
                      <div style={{ marginTop: 8, color: '#475569', fontSize: 14 }}>
                        {profile.student.rollNumber} · {profile.student.department} · Section {profile.student.section} · Batch {profile.student.batch}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 6, color: '#64748b', fontSize: 13 }}>
                      <span>Email: {profile.student.email || '—'}</span>
                      <span>Phone: {profile.student.phone || '—'}</span>
                      <span>Current Semester: {profile.student.currentSemester || '—'}</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
                  {summaryCards.map(card => (
                    <div key={card.label} style={{ ...cardStyle(`${card.accent}25`, card.bg), padding: '16px 18px' }}>
                      <div style={{ color: card.accent, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{card.label}</div>
                      <div style={{ marginTop: 10, color: '#0f172a', fontFamily: "'Sora',sans-serif", fontSize: 30, fontWeight: 800 }}>{card.value}</div>
                      <div style={{ marginTop: 6, color: '#64748b', fontSize: 12 }}>{card.sub}</div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 18 }}>
                  <div style={{ ...cardStyle('#c7d2fe', '#fff'), padding: 18 }}>
                    <SectionTitle title="Semester Trend" subtitle="SGPA progression and cumulative CGPA" />
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={profile.semesterTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="semester" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 10]} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="sgpa" stroke="#2563eb" strokeWidth={3} name="SGPA" />
                        <Line type="monotone" dataKey="cumulativeCgpa" stroke="#7c3aed" strokeWidth={3} name="Cumulative CGPA" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...cardStyle('#bae6fd', '#fff'), padding: 18 }}>
                    <SectionTitle title="Attendance by Subject" subtitle="Historical subject attendance records" />
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={attendanceChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-18} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="percentage" fill="#06b6d4" radius={[6, 6, 0, 0]} name="Attendance %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <div style={{ ...cardStyle('#fed7aa', '#fff'), padding: 18 }}>
                    <SectionTitle title="Marks History" subtitle="Subject-by-subject marks across semesters" />
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={marksChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} interval={0} angle={-18} textAnchor="end" height={64} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} domain={[0, 100]} />
                        <Tooltip />
                        <Bar dataKey="total" fill="#f59e0b" radius={[6, 6, 0, 0]} name="Total Marks" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ ...cardStyle('#fecdd3', '#fff'), padding: 18 }}>
                    <SectionTitle title="Backlog History" subtitle="Active and semester-linked backlogs in one place" />
                    {profile.backlogHistory.length === 0 && profile.overview.activeBacklogs.length === 0 ? (
                      <EmptyPanel text="No backlog history found for this student." />
                    ) : (
                      <div style={{ display: 'grid', gap: 10 }}>
                        {profile.backlogHistory.map(item => (
                          <div key={`${item.semester}-${item.academicYear}`} style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ color: '#9a3412', fontWeight: 700, fontSize: 13 }}>Semester {item.semester} · {item.academicYear}</div>
                            <div style={{ marginTop: 6, color: '#7c2d12', fontSize: 12 }}>
                              {item.subjects.map(subject => `${subject.subjectCode} (${subject.total})`).join(', ')}
                            </div>
                          </div>
                        ))}
                        {profile.overview.activeBacklogs.length > 0 && (
                          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 10, padding: '12px 14px' }}>
                            <div style={{ color: '#be123c', fontWeight: 700, fontSize: 13 }}>Active backlog codes</div>
                            <div style={{ marginTop: 6, color: '#9f1239', fontSize: 12 }}>
                              {profile.overview.activeBacklogs.join(', ')}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
                  <HistoryTable
                    title="Semester Summary"
                    columns={[
                      ['Semester', item => item.semester],
                      ['Academic Year', item => item.academicYear],
                      ['SGPA', item => item.sgpa],
                      ['Cumulative CGPA', item => item.cumulativeCgpa],
                      ['Avg Attendance', item => `${item.avgAttendance}%`],
                      ['Result', item => item.result],
                    ]}
                    rows={profile.semesterTrend}
                  />

                  <HistoryTable
                    title="Attendance History"
                    columns={[
                      ['Semester', item => item.semester],
                      ['Subject', item => item.subjectCode],
                      ['Subject Name', item => item.subjectName],
                      ['Attended', item => `${item.attendedClasses}/${item.totalClasses}`],
                      ['Percentage', item => `${item.percentage}%`],
                    ]}
                    rows={profile.attendanceHistory}
                  />
                </div>

                <HistoryTable
                  title="Marks History"
                  columns={[
                    ['Semester', item => item.semester],
                    ['Subject', item => item.subjectCode],
                    ['Subject Name', item => item.subjectName],
                    ['Internal', item => item.internal],
                    ['External', item => item.external],
                    ['Total', item => item.total],
                    ['Status', item => item.status],
                  ]}
                  rows={profile.marksHistory}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: PAGE_ACCENT, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: '#f8fafc', border: '1.5px solid #dbeafe', borderRadius: 10, padding: '10px 12px', outline: 'none', fontSize: 13, color: '#1e293b' }}
      >
        {children}
      </select>
    </div>
  );
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ color: '#0f172a', fontFamily: "'Sora',sans-serif", fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>{subtitle}</div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: '24px 18px', color: '#94a3b8', textAlign: 'center', fontSize: 12 }}>
      {text}
    </div>
  );
}

function EmptyPanel({ text }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 12, padding: '20px 16px', color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>
      {text}
    </div>
  );
}

function HistoryTable({ title, columns, rows }) {
  return (
    <div style={{ ...cardStyle('#e2e8f0', '#fff'), padding: 18 }}>
      <SectionTitle title={title} subtitle={`${rows.length} record(s)`} />
      {rows.length === 0 ? (
        <EmptyPanel text="No records available." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {columns.map(([label]) => (
                  <th key={label} style={{ textAlign: 'left', padding: '10px 12px', color: '#0f766e', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.7px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} style={{ background: index % 2 === 0 ? '#fff' : '#fbfdff' }}>
                  {columns.map(([label, render]) => (
                    <td key={label} style={{ padding: '10px 12px', color: '#334155', borderBottom: '1px solid #eef2f7', whiteSpace: 'nowrap' }}>
                      {render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
