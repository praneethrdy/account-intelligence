import { useEffect, useState } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { Icon } from './components/Icon';
import { ErrorState } from './components/States';
import { ToastProvider } from './components/Toast';
import { useAsync } from './hooks/useAsync';
import { navigate, useLinkHandler, useRoute } from './hooks/useRoute';
import { useTheme, type ThemeMode } from './hooks/useTheme';
import { AccountDetailPage } from './pages/AccountDetailPage';
import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { api } from './services/api';
import { on } from './services/events';

function AIStatus() {
  const { data, error } = useAsync(() => api.health(), []);
  if (error) return <span className="status-pill status-off">API offline</span>;
  if (!data) return null;
  return data.aiConfigured ? (
    <span className="status-pill status-on" title={`Model: ${data.model}`}>
      <span className="status-dot" /> <span className="status-text">AI connected</span>
    </span>
  ) : (
    <span className="status-pill status-off" title="Set OPENROUTER_API_KEY on the backend">
      <span className="status-dot" /> <span className="status-text">AI not configured</span>
    </span>
  );
}

const THEME_META: Record<ThemeMode, { icon: string; label: string }> = {
  system: { icon: 'monitor', label: 'System theme' },
  light: { icon: 'sun', label: 'Light theme' },
  dark: { icon: 'moon', label: 'Dark theme' },
};

export default function App() {
  const route = useRoute();
  const onLink = useLinkHandler();
  const { mode, setMode, cycle } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    const off = on('open-palette', () => setPaletteOpen(true));
    return () => {
      window.removeEventListener('keydown', onKey);
      off();
    };
  }, []);

  const theme = THEME_META[mode];

  return (
    <ToastProvider>
      <div className="app">
        <div className="backdrop" aria-hidden="true" />
        <header className="topbar">
          <a href="/" onClick={onLink} className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="32" height="32">
                <defs>
                  <linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#4f7cff" />
                    <stop offset="1" stopColor="#7c5cff" />
                  </linearGradient>
                </defs>
                <rect width="32" height="32" rx="9" fill="url(#bm)" />
                <path d="M8 21.5l5-6 4 3 7-9" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="24" cy="9.5" r="2.4" fill="#fff" />
              </svg>
            </span>
            <span>
              <span className="brand-name">Account Intelligence</span>
              <span className="brand-sub">Next-Best-Action Engine</span>
            </span>
          </a>
          <nav className="topnav" aria-label="Main">
            <a href="/" onClick={onLink} className={route.name === 'home' ? 'is-active' : ''}>
              Overview
            </a>
            <a href="/accounts" onClick={onLink} className={route.name === 'dashboard' || route.name === 'account' ? 'is-active' : ''}>
              Accounts
            </a>
          </nav>
          <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
            <Icon name="search" size={15} />
            <span className="search-trigger-text">Jump to account…</span>
            <span className="kbd-group" aria-hidden="true">
              <kbd>Ctrl</kbd>
              <kbd>K</kbd>
            </span>
          </button>
          <div className="topbar-right">
            <AIStatus />
            <button className="icon-btn" onClick={cycle} title={`${theme.label} (click to change)`} aria-label={`${theme.label}. Click to change theme`}>
              <Icon name={theme.icon} size={17} />
            </button>
          </div>
        </header>
        <main className="main">
          {route.name === 'home' && <HomePage />}
          {route.name === 'dashboard' && <DashboardPage />}
          {route.name === 'account' && <AccountDetailPage key={route.id} id={route.id} />}
          {route.name === 'notFound' && (
            <div className="page">
              <ErrorState title="Page not found" message="The page you’re looking for doesn’t exist.">
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                  Back to dashboard
                </button>
              </ErrorState>
            </div>
          )}
        </main>
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} setTheme={setMode} />
      </div>
    </ToastProvider>
  );
}
