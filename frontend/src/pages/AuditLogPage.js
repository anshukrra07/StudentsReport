import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const ACTION_LABELS = {
  'auth.login': 'Login',
  'report.export_pdf': 'PDF Export',
  'schedule.create': 'Schedule Created',
  'schedule.delete': 'Schedule Deleted',
  'schedule.run': 'Schedule Run',
};

function cardStyle(border = '#e2e8f8', bg = '#fff') {
  return {
    background: bg,
    border: `1.5px solid ${border}`,
    borderRadius: 16,
    boxShadow: '0 4px 20px rgba(15, 23, 42, 0.05)',
  };
}

export default function AuditLogPage() {
  const { API, user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ total: 0, byAction: [], byStatus: [] });
  const [filters, setFilters] = useState({ action: '', status: '' });
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ limit: '200' });
    if (filters.action) params.append('action', filters.action);
    if (filters.status) params.append('status', filters.status);

    setLoading(true);
    Promise.all([
      axios.get(`${API}/audit?${params.toString()}`),
      axios.get(`${API}/audit/summary?${params.toString()}`),
    ])
      .then(([logsRes, summaryRes]) => {
        setLogs(logsRes.data || []);
        setSummary(summaryRes.data || { total: 0, byAction: [], byStatus: [] });
      })
      .catch(() => {
        setLogs([]);
        setSummary({ total: 0, byAction: [], byStatus: [] });
      })
      .finally(() => setLoading(false));
  }, [API, filters]);

  const filteredLogs = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return logs;
    return logs.filter(log =>
      [
        log.actorUsername,
        log.actorName,
        log.action,
        log.message,
        log.entityType,
        log.status,
      ].some(value => String(value || '').toLowerCase().includes(term))
    );
  }, [logs, search]);

  const actions = useMemo(() => {
    const keys = summary.byAction.map(item => item.action);
    return [...new Set(keys)];
  }, [summary]);

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ position: 'relative', height: 168, overflow: 'hidden' }}>
        <img
          src="/campus/all.jpg"
          alt="campus"
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%', filter: 'brightness(0.45) saturate(1.1)' }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(15,23,42,0.93) 0%,rgba(37,99,235,0.18) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#1d4ed8,#0ea5e9,#1d4ed8)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 18, padding: '36px 28px 0', zIndex: 1 }}>
          <div style={{ width: 62, height: 62, borderRadius: 16, background: 'linear-gradient(135deg,#1d4ed8,#0ea5e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, boxShadow: '0 8px 25px rgba(37,99,235,0.45)', border: '2px solid rgba(255,255,255,0.25)', color: '#fff', flexShrink: 0 }}>
            🧾
          </div>
          <div>
            <h2 style={{ margin: 0, color: '#fff', fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800 }}>
              {user?.role === 'admin' ? 'Audit Log' : 'My Activity'}
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 5 }}>
              Track authentication, PDF exports, scheduled reports, and schedule changes.
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '22px 28px 32px', display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
          {[
            { label: 'Events', value: summary.total, color: '#1d4ed8', bg: '#eff6ff' },
            { label: 'Success', value: summary.byStatus.find(item => item.status === 'success')?.count || 0, color: '#10b981', bg: '#f0fdf4' },
            { label: 'Failures', value: summary.byStatus.find(item => item.status === 'failure')?.count || 0, color: '#ef4444', bg: '#fff1f2' },
            { label: 'Unique Actions', value: summary.byAction.length, color: '#7c3aed', bg: '#faf5ff' },
          ].map(card => (
            <div key={card.label} style={{ ...cardStyle(`${card.color}25`, card.bg), padding: '16px 18px' }}>
              <div style={{ color: card.color, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{card.label}</div>
              <div style={{ marginTop: 10, color: '#0f172a', fontFamily: "'Sora',sans-serif", fontSize: 30, fontWeight: 800 }}>{card.value}</div>
            </div>
          ))}
        </div>

        <div style={{ ...cardStyle('#bfdbfe', '#fff'), padding: '18px 22px' }}>
          <div style={{ color: '#1d4ed8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
            Filter Audit Activity
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 180px 1fr', gap: 12 }}>
            <SelectField label="Action" value={filters.action} onChange={value => setFilters(prev => ({ ...prev, action: value }))}>
              <option value="">All actions</option>
              {actions.map(action => <option key={action} value={action}>{ACTION_LABELS[action] || action}</option>)}
            </SelectField>

            <SelectField label="Status" value={filters.status} onChange={value => setFilters(prev => ({ ...prev, status: value }))}>
              <option value="">All statuses</option>
              <option value="success">Success</option>
              <option value="failure">Failure</option>
            </SelectField>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ color: '#1d4ed8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Search</label>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search user, action, or message"
                style={{ background: '#f8fafc', border: '1.5px solid #dbeafe', borderRadius: 10, padding: '10px 12px', outline: 'none', fontSize: 13, color: '#1e293b' }}
              />
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle('#dbeafe', '#fff'), overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #e2e8f0', background: '#f8fbff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ color: '#0f172a', fontWeight: 700, fontSize: 14 }}>Recent Activity</div>
            <div style={{ color: '#64748b', fontSize: 12 }}>{filteredLogs.length} records</div>
          </div>

          {loading ? (
            <div style={{ padding: 28, color: '#1d4ed8', fontWeight: 700 }}>Loading audit events...</div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: 28, color: '#64748b' }}>No audit events match the current filters.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8faff' }}>
                    {['Time', 'Actor', 'Action', 'Status', 'Entity', 'Message', 'Details'].map(header => (
                      <th key={header} style={{ color: '#1d4ed8', padding: '10px 14px', textAlign: 'left', fontWeight: 800, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.8px', whiteSpace: 'nowrap', borderBottom: '2px solid #dbeafe' }}>
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map(log => (
                    <tr key={log._id} style={{ borderBottom: '1px solid #eef2f7' }}>
                      <td style={tdStyle}>{new Date(log.createdAt).toLocaleString('en-IN')}</td>
                      <td style={tdStyle}>
                        <div style={{ color: '#0f172a', fontWeight: 700 }}>{log.actorName || log.actorUsername || 'Unknown'}</div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>{log.actorRole || '—'}{log.department ? ` · ${log.department}` : ''}</div>
                      </td>
                      <td style={tdStyle}>{ACTION_LABELS[log.action] || log.action}</td>
                      <td style={tdStyle}>
                        <span style={{
                          display: 'inline-block',
                          padding: '3px 9px',
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          color: log.status === 'success' ? '#047857' : '#b91c1c',
                          background: log.status === 'success' ? '#ecfdf5' : '#fff1f2',
                          border: `1px solid ${log.status === 'success' ? '#a7f3d0' : '#fecdd3'}`,
                        }}>
                          {log.status}
                        </span>
                      </td>
                      <td style={tdStyle}>{log.entityType || '—'}{log.entityId ? ` · ${log.entityId}` : ''}</td>
                      <td style={{ ...tdStyle, minWidth: 260 }}>{log.message || '—'}</td>
                      <td style={{ ...tdStyle, color: '#64748b', fontSize: 11, minWidth: 220 }}>
                        {renderMetadata(log.metadata)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ color: '#1d4ed8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</label>
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

function renderMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return '—';
  const pairs = Object.entries(metadata)
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  return pairs.length ? pairs.join(' | ') : '—';
}

const tdStyle = {
  color: '#374151',
  padding: '10px 14px',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
};
