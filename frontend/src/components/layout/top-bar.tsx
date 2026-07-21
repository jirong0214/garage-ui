import * as React from 'react';
import { ChevronLeft, ChevronRight, User, LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  const { theme, setTheme } = useTheme();
  const { user, config, logout } = useAuthStore();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [navigationPending, setNavigationPending] = React.useState(false);
  const currentUrl = `${location.pathname}${location.search}${location.hash}`;
  const isBucketPage = location.pathname === '/buckets' || location.pathname.startsWith('/buckets/');
  const [bucketHistory, setBucketHistory] = React.useState(() => {
    if (!isBucketPage || currentUrl === '/buckets') return {entries: ['/buckets'], index: 0};
    return {entries: ['/buckets', currentUrl], index: 1};
  });
  const menuRef = React.useRef<HTMLDivElement>(null);
  const bucketHistoryTargetRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setNavigationPending(false);
    if (bucketHistoryTargetRef.current === currentUrl) {
      bucketHistoryTargetRef.current = null;
      return;
    }
    setBucketHistory((current) => {
      if (!isBucketPage || currentUrl === '/buckets') {
        return current.entries.length === 1 && current.entries[0] === '/buckets' && current.index === 0
          ? current
          : {entries: ['/buckets'], index: 0};
      }
      if (current.entries[current.index] === currentUrl) return current;

      const entries = [...current.entries.slice(0, current.index + 1), currentUrl];
      return {entries, index: entries.length - 1};
    });
  }, [currentUrl, isBucketPage]);

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const hasUser = !!(config && (config.admin.enabled || config.oidc.enabled) && user);
  const canGoBack = bucketHistory.index > 0;
  const canGoForward = bucketHistory.index < bucketHistory.entries.length - 1;

  const moveInBucketHistory = (delta: -1 | 1) => {
    if (navigationPending || (delta < 0 ? !canGoBack : !canGoForward)) return;
    const index = bucketHistory.index + delta;
    const target = bucketHistory.entries[index];
    setNavigationPending(true);
    bucketHistoryTargetRef.current = target;
    setBucketHistory((current) => ({...current, index}));
    navigate(target, {replace: true});
  };

  return (
    <div
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--surface-sunken)] px-4 backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-8 md:pl-0">
        {isBucketPage && (
        <div className="flex shrink-0 items-center rounded-lg border border-[var(--border)] bg-[var(--background)]/70 p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => moveInBucketHistory(-1)}
            disabled={!canGoBack || navigationPending}
            aria-label="Back"
            title="Back"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:text-[var(--muted-foreground)] disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => moveInBucketHistory(1)}
            disabled={!canGoForward || navigationPending}
            aria-label="Forward"
            title="Forward"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--foreground)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:text-[var(--muted-foreground)] disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        )}
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
