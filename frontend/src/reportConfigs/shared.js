import React from 'react';

export const cgpaColor = v => parseFloat(v) >= 8 ? '#10b981' : parseFloat(v) >= 6 ? '#f59e0b' : '#ef4444';
export const pctColor  = v => parseFloat(v) >= 75 ? '#10b981' : parseFloat(v) >= 65 ? '#f59e0b' : '#ef4444';
export const passColor = v => parseFloat(v) >= 75 ? '#10b981' : '#f59e0b';

// Convenience badge renderer
export const cgpaBadge = (v, size = 13) => (
  <span style={{ color: cgpaColor(v), fontWeight: 700, fontSize: size, background: cgpaColor(v) + '15', padding: '2px 8px', borderRadius: 6 }}>{v}</span>
);
export const pctBadge = (v, size = 13) => (
  <span style={{ color: pctColor(parseFloat(v)), fontWeight: 700, background: parseFloat(v) < 75 ? '#fff1f2' : parseFloat(v) < 65 ? '#fef3c7' : '#f0fdf4', padding: '2px 8px', borderRadius: 6, fontSize: size }}>{v}%</span>
);
