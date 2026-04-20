import { useState, useCallback, useRef } from 'react';

/**
 * useToast — lightweight toast notifications, no dependencies.
 *
 * Usage:
 *   const { toasts, showToast, ToastContainer } = useToast();
 *   showToast('Something went wrong', 'error');
 *   return <><ToastContainer />{...rest}</>;
 *
 * Severity levels: 'error' | 'warning' | 'success' | 'info'
 */

const STYLES = {
  error:   { bg: '#fff1f2', border: '#fecdd3', icon: '❌', color: '#dc2626', label: 'Error'   },
  warning: { bg: '#fffbeb', border: '#fde68a', icon: '⚠️', color: '#d97706', label: 'Warning' },
  success: { bg: '#f0fdf4', border: '#a7f3d0', icon: '✅', color: '#059669', label: 'Success' },
  info:    { bg: '#f0f9ff', border: '#bae6fd', icon: 'ℹ️', color: '#0284c7', label: 'Info'    },
};

// Error code → user-friendly message map
const ERROR_MESSAGES = {
  INVALID_FILTER: 'Invalid filter value',
  SERVER_ERROR:   'Server error — please try again',
  NETWORK_ERROR:  'Cannot reach the server — check your connection',
  FILTER_INVALID: 'Invalid filter combination',
};

export function parseApiError(error) {
  // Axios network error (no response at all)
  if (!error.response) {
    return { code: 'NETWORK_ERROR', message: 'Cannot reach the server — check your connection', field: null };
  }

  const data = error.response?.data;
  if (data && data.error) {
    return {
      code:    data.error,
      message: ERROR_MESSAGES[data.error] || data.message || 'An error occurred',
      field:   data.field || null,
      raw:     data.message,
    };
  }

  const status = error.response?.status;
  if (status === 401) return { code: 'UNAUTHORIZED', message: 'Session expired — please log in again', field: null };
  if (status === 403) return { code: 'FORBIDDEN',    message: "You don't have permission for this report", field: null };
  if (status === 404) return { code: 'NOT_FOUND',    message: 'Report endpoint not found',               field: null };
  if (status >= 500)  return { code: 'SERVER_ERROR', message: 'Server error — please try again',         field: null };

  return { code: 'UNKNOWN', message: 'An unexpected error occurred', field: null };
}

let _nextId = 0;

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback(id => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 280);
    clearTimeout(timers.current[id]);
  }, []);

  const showToast = useCallback((message, severity = 'info', { duration = 5000, detail } = {}) => {
    const id = ++_nextId;
    setToasts(prev => [...prev.slice(-3), { id, message, severity, detail, leaving: false }]);
    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  // Convenience: parse an Axios error object and show the right toast
  const showApiError = useCallback((axiosError) => {
    const parsed = parseApiError(axiosError);
    const detail = parsed.raw && parsed.raw !== parsed.message ? parsed.raw : undefined;
    showToast(parsed.message, 'error', { detail });
    return parsed;
  }, [showToast]);

  function ToastContainer() {
    if (toasts.length === 0) return null;
    return (
      <div style={{
        position: 'fixed', top: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 10,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        pointerEvents: 'none',
      }}>
        <style>{`
          @keyframes toastIn  { from { opacity:0; transform:translateX(40px) scale(0.95) } to { opacity:1; transform:translateX(0) scale(1) } }
          @keyframes toastOut { from { opacity:1; transform:translateX(0) scale(1) }        to { opacity:0; transform:translateX(40px) scale(0.95) } }
        `}</style>
        {toasts.map(t => {
          const s = STYLES[t.severity] || STYLES.info;
          return (
            <div key={t.id} style={{
              background: s.bg,
              border: `1.5px solid ${s.border}`,
              borderLeft: `4px solid ${s.color}`,
              borderRadius: 10,
              padding: '12px 14px',
              minWidth: 280, maxWidth: 380,
              boxShadow: '0 8px 28px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'flex-start', gap: 10,
              animation: `${t.leaving ? 'toastOut' : 'toastIn'} 0.28s ease forwards`,
              pointerEvents: 'all',
              cursor: 'default',
            }}>
              <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{s.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: s.color, fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>
                  {s.label}
                </div>
                <div style={{ color: '#1e293b', fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{t.message}</div>
                {t.detail && (
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 4, lineHeight: 1.3, fontStyle: 'italic' }}>{t.detail}</div>
                )}
              </div>
              <button onClick={() => dismiss(t.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#94a3b8', fontSize: 16, lineHeight: 1, padding: '0 2px',
                flexShrink: 0, fontFamily: 'inherit',
              }} title="Dismiss">×</button>
            </div>
          );
        })}
      </div>
    );
  }

  return { toasts, showToast, showApiError, dismiss, ToastContainer };
}
