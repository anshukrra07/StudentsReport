import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

const THEME_VARS = {
  light: {
    '--app-bg': '#f0f4ff',
    '--panel-bg': '#ffffff',
    '--panel-muted': '#f8faff',
    '--border': '#e2e8f8',
    '--text1': '#1e2d4a',
    '--text2': '#64748b',
    '--text3': '#94a3b8',
  },
  dark: {
    '--app-bg': '#0f172a',
    '--panel-bg': '#111827',
    '--panel-muted': '#1f2937',
    '--border': '#334155',
    '--text1': '#e2e8f0',
    '--text2': '#94a3b8',
    '--text3': '#64748b',
  },
};

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('deo_theme');
    if (saved) return saved === 'dark';
    // Default to system preference
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    const themeName = dark ? 'dark' : 'light';
    const root = document.documentElement;
    root.setAttribute('data-theme', themeName);
    Object.entries(THEME_VARS[themeName]).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
    document.body.style.background = THEME_VARS[themeName]['--app-bg'];
    document.body.style.color = THEME_VARS[themeName]['--text1'];
    localStorage.setItem('deo_theme', dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = () => setDark(d => !d);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
