import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import Chatbot from './pages/Chatbot';
import SchedulePage from './pages/SchedulePage';
import RiskPrediction from './pages/RiskPrediction';
import StudentProfilePage from './pages/StudentProfilePage';
import AuditLogPage from './pages/AuditLogPage';
import AlertsPage from './pages/AlertsPage';
import BulkImportPage from './pages/BulkImportPage';
import Sidebar from './components/Sidebar';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import ReportPage from './components/ReportPage';
import CFGS from './reportConfigs/index';

// ── CFGS is now split across src/reportConfigs/*.js
// ── To add a new report: create the config file, import it in reportConfigs/index.js.

function AppContent() {
  const { user, loading } = useAuth();
  const { dark } = useTheme();
  const [page, setPage] = useState('dashboard');
  const appBg = dark ? '#0f172a' : '#f0f4ff';

  useEffect(() => {
    const handler = e => setPage(e.detail);
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  if (loading) return (
    <div style={{ background: appBg, height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <div style={{ position: 'relative', width: 60, height: 60 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '4px solid #bfdbfe', borderTop: '4px solid #2563eb', animation: 'spin 0.9s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 10, borderRadius: '50%', border: '3px solid #ddd6fe', borderBottom: '3px solid #7c3aed', animation: 'spin 1.4s linear infinite reverse' }} />
      </div>
      <div style={{ color: '#2563eb', fontSize: 13, fontWeight: 700 }}>Loading VFSTR Portal...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  if (!user) return <LoginPage />;

  return (
    <div style={{ display: 'flex', background: appBg, minHeight: '100vh', fontFamily: "'Plus Jakarta Sans',sans-serif" }}>
      <Sidebar active={page} onNav={setPage} />
      <main style={{ marginLeft: 256, flex: 1, overflowY: 'auto', minHeight: '100vh' }}>
        {page === 'dashboard'        ? <Dashboard />
        : page === 'chatbot'         ? <Chatbot />
        : page === 'student-profile' ? <StudentProfilePage />
        : page === 'audit-log'       ? <AuditLogPage />
        : page === 'alerts'          ? <AlertsPage />
        : page === 'bulk-import'     ? <BulkImportPage />
        : page === 'schedule'        ? <SchedulePage />
        : page === 'ai-risk'         ? <RiskPrediction />
        : CFGS[page]                 ? <ReportPage reportType={page} {...CFGS[page]} />
        : <Dashboard />}
      </main>
    </div>
  );
}

export default function App() { return <ThemeProvider><AuthProvider><AppContent /></AuthProvider></ThemeProvider>; }
