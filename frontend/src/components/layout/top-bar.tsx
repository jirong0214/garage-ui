import * as React from 'react';
import { ArrowLeft, ArrowRight, User, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Breadcrumb, type BreadcrumbItem } from '@/components/ui/breadcrumb';
import { useTheme } from '@/components/theme-provider';
import { useAuthStore } from '@/store/auth-store';
import { cn } from '@/lib/utils';

interface TopBarProps {
  crumbs: BreadcrumbItem[];
}

export function TopBar({ crumbs }: TopBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const { theme, setTheme } = useTheme();
  const { user, config, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [navigationPending, setNavigationPending] = React.useState(false);
  const [appHistory, setAppHistory] = React.useState(() => ({
    entries: [location.key],
    index: 0,
  }));
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setNavigationPending(false);
    setAppHistory((current) => {
      if (current.entries[current.index] === location.key) return current;

      const knownIndex = current.entries.indexOf(location.key);
      if (navigationType === 'POP') {
        return knownIndex >= 0
          ? {...current, index: knownIndex}
          : {entries: [location.key], index: 0};
      }

      if (navigationType === 'REPLACE') {
        const entries = [...current.entries];
        entries[current.index] = location.key;
        return {entries, index: current.index};
      }

      const entries = [...current.entries.slice(0, current.index + 1), location.key];
      return {entries, index: entries.length - 1};
    });
  }, [location.key, navigationType]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const hasUser = !!(config && (config.admin.enabled || config.oidc.enabled) && user);
  const canGoBack = appHistory.index > 0;
  const canGoForward = appHistory.index < appHistory.entries.length - 1;

  const moveInHistory = (delta: -1 | 1) => {
    if (navigationPending || (delta < 0 ? !canGoBack : !canGoForward)) return;
    setNavigationPending(true);
    navigate(delta);
  };

  return (
    <div
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-8 md:pl-0">
        <div className="flex shrink-0 items-center gap-0.5 border-r border-[var(--border)] pr-2">
          <button
            type="button"
            onClick={() => moveInHistory(-1)}
            disabled={!canGoBack || navigationPending}
            aria-label="Back"
            title="Back"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => moveInHistory(1)}
            disabled={!canGoForward || navigationPending}
            aria-label="Forward"
            title="Forward"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <Breadcrumb items={crumbs} className="flex-1" />
      </div>
      <div className="flex items-center gap-1">
        <ThemeMiniToggle theme={theme} setTheme={setTheme} />
        {hasUser && (
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex h-8 items-center gap-2 rounded-md px-2 text-[13.5px] text-[var(--foreground)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-foreground)]">
                <User className="h-3.5 w-3.5" />
              </span>
              <span className="hidden max-w-[140px] truncate sm:inline">{user?.name || user?.username}</span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-1 w-56 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--popover)] shadow-lg">
                <div className="border-b border-[var(--border)] px-3 py-2">
                  <div className="truncate text-[14px] font-medium">{user?.name || user?.username}</div>
                  {user?.email && (
                    <div className="truncate text-[12.5px] text-[var(--muted-foreground)]">{user.email}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[14px] hover:bg-[var(--accent)]"
                >
                  <LogOut className="h-3.5 w-3.5" /> Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeMiniToggle({
  theme,
  setTheme,
}: {
  theme: 'light' | 'dark' | 'system';
  setTheme: (t: 'light' | 'dark' | 'system') => void;
}) {
  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark';
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch theme (current: ${theme})`}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted-foreground)]',
        'hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
