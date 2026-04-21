import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import useToast from '../hooks/useToast';

const ALERT_TYPES = [
  { value: 'low_attendance', label: 'Low Attendance',   icon: '📉', color: '#0ea5e9', desc: 'Students below attendance threshold'         },
  { value: 'backlog_alert',  label: 'Active Backlogs',  icon: '⚠️', color: '#ef4444', desc: 'Students with one or more backlogs'           },
  { value: 'low_cgpa',       label: 'Low CGPA',         icon: '📊', color: '#f59e0b', desc: 'Students with CGPA below 6.0'                 },
  { value: 'at_risk',        label: 'All At-Risk',      icon: '⚡', color: '#f97316', desc: 'Any of: low attendance, backlogs, or low CGPA' },
  { value: 'custom',         label: 'Custom Message',   icon: '✏️',  color: '#8b5cf6', desc: 'Send a custom notice to a filtered group'    },
];

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { value: 'sms',      label: 'SMS',      icon: '📱' },
];

export default function AlertsPage() {
  const { API, user } = useAuth();
  const { showToast, ToastContainer } = useToast();

  const [status,        setStatus]        = useState(null);   // Twilio config status
  const [alertType,     setAlertType]     = useState('low_attendance');
  const [channel,       setChannel]       = useState('whatsapp');
  const [threshold,     setThreshold]     = useState('75');
  const [customMessage, setCustomMessage] = useState('');
  const [filters,       setFilters]       = useState({ department: '', batch: '', section: '', semester: '' });
  const [meta,          setMeta]          = useState({ departments: [], batches: [], sections: [] });

  const [preview,       setPreview]       = useState(null);
  const [previewing,    setPreviewing]    = useState(false);
  const [sending,       setSending]       = useState(false);
  const [results,       setResults]       = useState(null);
  const [confirmOpen,   setConfirmOpen]   = useState(false);

  const selectedType = ALERT_TYPES.find(t => t.value === alertType);
  const accentColor  = selectedType?.color || '#0ea5e9';

  // Load Twilio status + meta on mount
  useEffect(() => {
    axios.get(`${API}/alerts/status`).then(r => setStatus(r.data)).catch(() => setStatus({ configured: false }));
    axios.get(`${API}/students/meta`).then(r => setMeta(r.data)).catch(() => {});
  }, [API]);

  const buildParams = useCallback(() => {
    const p = new URLSearchParams();
    p.append('alertType', alertType);
    p.append('threshold', threshold || '75');
    Object.entries(filters).forEach(([k, v]) => { if (v) p.append(k, v); });
    return p.toString();
  }, [alertType, threshold, filters]);

  const runPreview = async () => {
    setPreviewing(true);
    setPreview(null);
    setResults(null);
    try {
      const res = await axios.get(`${API}/alerts/preview?${buildParams()}`);
      setPreview(res.data);
    } catch (e) {
      showToast(e.response?.data?.message || 'Preview failed', 'error');
    }
    setPreviewing(false);
  };

  const sendAlerts = async () => {
    setConfirmOpen(false);
    setSending(true);
    setResults(null);
    try {
      const res = await axios.post(`${API}/alerts/dispatch?${buildParams()}`, {
        alertType, channel, threshold: parseFloat(threshold) || 75,
        customMessage: alertType === 'custom' ? customMessage : undefined,
      });
      setResults(res.data);
      const s = res.data.summary;
      showToast(`Sent ${s.sent} alerts — ${s.failed} failed, ${s.skipped} skipped`, s.sent > 0 ? 'success' : 'warning');
    } catch (e) {
      showToast(e.response?.data?.message || 'Send failed', 'error');
    }
    setSending(false);
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f0f4ff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <ToastContainer />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } } @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Hero */}
      <div style={{ background: 'linear-gradient(135deg,#0f172a,#1e3a5f)', padding: '32px 28px 28px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 200, height: 200, borderRadius: '50%', background: 'rgba(14,165,233,0.08)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: 100, width: 120, height: 120, borderRadius: '50%', background: 'rgba(139,92,246,0.07)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,#0ea5e9,#2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 8px 24px rgba(14,165,233,0.4)' }}>🔔</div>
            <div>
              <h2 style={{ fontFamily: "'Sora',sans-serif", fontSize: 22, fontWeight: 800, color: '#fff', margin: 0 }}>WhatsApp & SMS Alerts</h2>
              <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Vignan's Foundation for Science, Technology & Research — Academic Intervention System</p>
            </div>
          </div>

          {/* Twilio status pill */}
          {status && (
            <div style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: status.configured ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', border: `1px solid ${status.configured ? '#10b981' : '#ef4444'}40`, borderRadius: 20, padding: '5px 14px' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.configured ? '#10b981' : '#ef4444', display: 'inline-block' }} />
              <span style={{ fontSize: 12, color: status.configured ? '#6ee7b7' : '#fca5a5', fontWeight: 600 }}>
                {status.configured
                  ? `Twilio active — ${[status.channels?.whatsapp && 'WhatsApp', status.channels?.sms && 'SMS'].filter(Boolean).join(' + ')}`
                  : 'Twilio not configured — add keys to .env'}
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: '22px 28px 40px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>

        {/* ── Left column: configuration ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Alert type selector */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1.5px solid #e2e8f8', boxShadow: '0 4px 20px rgba(30,58,138,0.05)' }}>
            <SectionHeader color={accentColor} label="Alert Type" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 10, marginTop: 14 }}>
              {ALERT_TYPES.map(t => (
                <button key={t.value} onClick={() => { setAlertType(t.value); setPreview(null); setResults(null); }}
                  style={{ background: alertType === t.value ? `${t.color}12` : '#f8faff', border: `1.5px solid ${alertType === t.value ? t.color : '#e2e8f0'}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.18s', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                  <div style={{ fontSize: 20, marginBottom: 5 }}>{t.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: alertType === t.value ? t.color : '#1e2d4a' }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, lineHeight: 1.4 }}>{t.desc}</div>
                </button>
              ))}
            </div>

            {alertType === 'custom' && (
              <div style={{ marginTop: 14 }}>
                <label style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>Custom Message</label>
                <textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)}
                  placeholder="Type your message here. The student's name and roll number will be prepended automatically."
                  rows={4} style={{ width: '100%', marginTop: 6, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", color: '#1e2d4a', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
              </div>
            )}

            {alertType === 'low_attendance' && (
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', whiteSpace: 'nowrap' }}>Alert threshold:</label>
                <input type="number" min="0" max="100" value={threshold} onChange={e => setThreshold(e.target.value)}
                  style={{ width: 80, border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '7px 10px', fontSize: 13, fontFamily: "'Plus Jakarta Sans',sans-serif", outline: 'none', color: '#1e2d4a' }} />
                <span style={{ fontSize: 12, color: '#94a3b8' }}>% — students below this get alerted</span>
              </div>
            )}
          </div>

          {/* Channel + filters */}
          <div style={{ background: '#fff', borderRadius: 16, padding: '20px 22px', border: '1.5px solid #e2e8f8', boxShadow: '0 4px 20px rgba(30,58,138,0.05)' }}>
            <SectionHeader color={accentColor} label="Channel & Filters" />

            <div style={{ display: 'flex', gap: 10, marginTop: 14, marginBottom: 18 }}>
              {CHANNELS.map(c => (
                <button key={c.value} onClick={() => setChannel(c.value)}
                  style={{ flex: 1, background: channel === c.value ? `${accentColor}12` : '#f8faff', border: `1.5px solid ${channel === c.value ? accentColor : '#e2e8f0'}`, borderRadius: 10, padding: '10px', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif', transition: 'all 0.18s'", fontWeight: 700, fontSize: 13, color: channel === c.value ? accentColor : '#64748b' }}>
                  {c.icon} {c.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
              {user?.role === 'admin' && (
                <FilterSelect label="Department" value={filters.department} onChange={v => setFilters({ ...filters, department: v })} color={accentColor}
                  options={meta.departments.map(d => ({ value: d, label: d }))} placeholder="All Departments" />
              )}
              <FilterSelect label="Batch Year" value={filters.batch} onChange={v => setFilters({ ...filters, batch: v })} color={accentColor}
                options={meta.batches.map(b => ({ value: b, label: b }))} placeholder="All Batches" />
              <FilterSelect label="Section" value={filters.section} onChange={v => setFilters({ ...filters, section: v })} color={accentColor}
                options={meta.sections.map(s => ({ value: s, label: `Section ${s}` }))} placeholder="All Sections" />
              <FilterSelect label="Semester" value={filters.semester} onChange={v => setFilters({ ...filters, semester: v })} color={accentColor}
                options={[1,2,3,4,5,6,7,8].map(s => ({ value: String(s), label: `Year ${Math.ceil(s/2)} · Semester ${s%2===0?2:1}` }))} placeholder="All Semesters" />
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={runPreview} disabled={previewing}
              style={{ flex: 1, background: '#f8faff', border: `1.5px solid ${accentColor}`, borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: accentColor, cursor: previewing ? 'not-allowed' : 'pointer', transition: 'all 0.2s', fontFamily: "'Plus Jakarta Sans',sans-serif", opacity: previewing ? 0.7 : 1 }}>
              {previewing
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Spinner color={accentColor} /> Previewing...</span>
                : '🔍 Preview Recipients'}
            </button>
            <button onClick={() => { if (!preview) { showToast('Run Preview first to see who will be alerted', 'warning'); return; } setConfirmOpen(true); }}
              disabled={sending || !status?.configured}
              title={!status?.configured ? 'Configure Twilio in .env to enable sending' : ''}
              style={{ flex: 1, background: status?.configured ? `linear-gradient(135deg,${accentColor},${accentColor}cc)` : '#e2e8f0', border: 'none', borderRadius: 10, padding: '12px', fontSize: 14, fontWeight: 700, color: status?.configured ? '#fff' : '#94a3b8', cursor: (!status?.configured || sending) ? 'not-allowed' : 'pointer', transition: 'all 0.2s', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
              {sending
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><Spinner color="#fff" /> Sending...</span>
                : `🚀 Send ${selectedType?.label || ''} Alerts`}
            </button>
          </div>
        </div>

        {/* ── Right column: preview + results ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Preview card */}
          {preview && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '20px', border: `1.5px solid ${accentColor}30`, boxShadow: `0 4px 20px ${accentColor}10`, animation: 'fadeIn 0.3s ease' }}>
              <SectionHeader color={accentColor} label="Preview" />
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard label="Will be alerted" value={preview.total} color={accentColor} />
                <StatCard label="Reachable (has phone)" value={preview.reachable} color="#10b981" />
                <StatCard label="No phone on record" value={preview.unreachable} color="#f97316" />
                <StatCard label="Threshold" value={`< ${preview.threshold}%`} color="#8b5cf6" />
              </div>

              {preview.unreachable > 0 && (
                <div style={{ marginTop: 12, padding: '10px 12px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                  ⚠️ {preview.unreachable} students have no phone number stored — update their records to reach them.
                </div>
              )}

              <div style={{ marginTop: 14, maxHeight: 280, overflowY: 'auto' }}>
                {preview.students.map((s, i) => (
                  <div key={s.rollNumber} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < preview.students.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: 14 }}>{s.hasPhone ? '✅' : '❌'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e2d4a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.rollNumber} · {s.department} {s.section}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      {alertType === 'low_attendance' && <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>{s.avgAttendance}%</div>}
                      {(alertType === 'backlog_alert' || alertType === 'at_risk') && s.backlogCount > 0 && <div style={{ fontSize: 11, color: '#f97316', fontWeight: 700 }}>{s.backlogCount} backlogs</div>}
                      {(alertType === 'low_cgpa' || alertType === 'at_risk') && s.cgpa > 0 && <div style={{ fontSize: 11, color: '#8b5cf6', fontWeight: 700 }}>CGPA {s.cgpa}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Results card */}
          {results && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '20px', border: '1.5px solid #a7f3d0', boxShadow: '0 4px 20px rgba(16,185,129,0.08)', animation: 'fadeIn 0.3s ease' }}>
              <SectionHeader color="#10b981" label="Dispatch Results" />
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <StatCard label="Sent ✅"    value={results.summary.sent}    color="#10b981" />
                <StatCard label="Failed ❌"  value={results.summary.failed}  color="#ef4444" />
                <StatCard label="Skipped ⏭️" value={results.summary.skipped} color="#f97316" />
                <StatCard label="Total"      value={results.summary.total}   color="#64748b" />
              </div>

              {results.failed.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>Failed</div>
                  {results.failed.map(f => (
                    <div key={f.rollNumber} style={{ padding: '6px 10px', background: '#fff1f2', borderRadius: 6, fontSize: 12, color: '#dc2626', marginBottom: 4 }}>
                      {f.name} ({f.rollNumber}) — {f.error}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!preview && !results && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '40px 24px', border: '1.5px dashed #e2e8f0', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🔔</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>Configure and Preview</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, lineHeight: 1.5 }}>
                Select an alert type, apply filters, then click<br /><strong>Preview Recipients</strong> before sending.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '28px 32px', maxWidth: 400, width: '90%', boxShadow: '0 24px 60px rgba(0,0,0,0.2)', animation: 'fadeIn 0.2s ease' }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>🚀</div>
            <h3 style={{ textAlign: 'center', fontFamily: "'Sora',sans-serif", fontSize: 17, fontWeight: 800, color: '#1e2d4a', margin: '0 0 8px' }}>Confirm Alert Dispatch</h3>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#64748b', lineHeight: 1.5, margin: '0 0 20px' }}>
              You're about to send <strong style={{ color: accentColor }}>{selectedType?.label}</strong> alerts
              via <strong>{channel.toUpperCase()}</strong> to{' '}
              <strong style={{ color: accentColor }}>{preview?.reachable ?? '?'} students</strong>.
              This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmOpen(false)}
                style={{ flex: 1, background: '#f8faff', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#64748b', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Cancel
              </button>
              <button onClick={sendAlerts}
                style={{ flex: 1, background: `linear-gradient(135deg,${accentColor},${accentColor}cc)`, border: 'none', borderRadius: 8, padding: '10px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
                Yes, Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function SectionHeader({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
      <span style={{ color, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.2px' }}>{label}</span>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: `${color}08`, border: `1px solid ${color}20`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: "'Sora',sans-serif" }}>{value}</div>
      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, placeholder, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 10, fontWeight: 800, color: value ? color : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ background: value ? `${color}10` : '#f8faff', border: `1.5px solid ${value ? color : '#e2e8f0'}`, borderRadius: 8, padding: '8px 10px', fontSize: 13, color: value ? '#1e2d4a' : '#64748b', outline: 'none', fontFamily: "'Plus Jakarta Sans',sans-serif", cursor: 'pointer' }}>
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function Spinner({ color = '#fff' }) {
  return <span style={{ width: 14, height: 14, border: `2px solid ${color}40`, borderTop: `2px solid ${color}`, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />;
}