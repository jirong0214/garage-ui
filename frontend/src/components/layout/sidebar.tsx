import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { BookOpen, Database, Key, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Server } from 'lucide-react';
import { useAuthStore } from '@/store/auth-store';
import { useQuery } from '@tanstack/react-query';
import { healthApi, garageApi } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  visible?: (p: ReturnType<typeof usePermissions>) => boolean;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    items: [{ title: 'Dashboard', href: '/', icon: LayoutDashboard }],
  },
  {
    label: 'Storage',
    items: [
      { title: 'Buckets', href: '/buckets', icon: Database, visible: (p) => p.hasAnyPerm('bucket.list') },
    ],
  },
  {
    label: 'Cluster',
    items: [
      { title: 'Cluster', href: '/cluster', icon: Server, visible: (p) => p.hasAnyClusterAccess },
      { title: 'Access Control', href: '/access', icon: Key, visible: (p) => p.hasClusterPerm('key.list') },
    ],
  },
];

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export function Sidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: SidebarProps) {
  const location = useLocation();
  const { config } = useAuthStore();
  const perms = usePermissions();

  const { data: uiVersion } = useQuery({
    queryKey: ['ui-version'],
    queryFn: healthApi.getVersion,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { data: nodeInfo } = useQuery({
    queryKey: ['garage-version'],
    queryFn: () => garageApi.getNodeInfo('self'),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: !!(config && (config.admin.enabled || config.oidc.enabled)),
  });

  const garageVersion = nodeInfo ? Object.values(nodeInfo.success)[0]?.garageVersion : undefined;

  const isActive = (href: string) =>
    href === '/'
      ? location.pathname === '/'
      : location.pathname === href || location.pathname.startsWith(href + '/');

  return (
    <aside
      className={cn(
        'flex h-full w-64 flex-col border-r border-[var(--border)] bg-[var(--background)] transition-[width,transform] duration-300 ease-in-out md:translate-x-0',
        isCollapsed ? 'md:w-16' : 'md:w-64',
        'fixed md:static z-50',
        isOpen ? 'translate-x-0' : '-translate-x-full',
      )}
    >
      <div className={cn('flex h-16 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3', isCollapsed && 'md:justify-center md:gap-0')}>
        <img src="/garage.png" alt="" className={cn('h-8 w-8', isCollapsed && 'md:hidden')} />
        <span className={cn('min-w-0 flex-1 truncate text-[18px] font-semibold tracking-tight', isCollapsed && 'md:hidden')}>Garage UI</span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] md:inline-flex"
        >
          {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>
      <nav className={cn('flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin', isCollapsed && 'md:px-2')}>
        {navGroups.map((group, gi) => {
          const visibleItems = group.items.filter((item) => !item.visible || item.visible(perms));
          if (visibleItems.length === 0) return null;
          return (
            <div key={gi}>
              {group.label && (
                <div className={cn('px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted-foreground)]', isCollapsed && 'md:hidden')}>
                  {group.label}
                </div>
              )}
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        onClick={onClose}
                        title={isCollapsed ? item.title : undefined}
                        className={cn(
                          'flex h-9 items-center gap-2 rounded-md px-2.5 text-[14px] transition-colors',
                          isCollapsed && 'md:justify-center md:px-0',
                          active
                            ? 'bg-[var(--primary)] font-medium text-[var(--primary-foreground)]'
                            : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]',
                        )}
                        >
                        <Icon className="h-4 w-4" />
                        <span className={cn(isCollapsed && 'md:hidden')}>{item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className={cn('px-3 py-3 flex flex-col items-center gap-1.5', isCollapsed && 'md:hidden')}>
        <a
          href="https://garagehq.deuxfleurs.fr/documentation/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Documentation
        </a>
        {(uiVersion || garageVersion) && (
          <div className="flex items-center gap-1.5 border-t border-[var(--border)] pt-2 w-full justify-center text-[12px] text-[var(--muted-foreground)]">
            {uiVersion && <span>UI {uiVersion}</span>}
            {uiVersion && garageVersion && <span className="opacity-40">•</span>}
            {garageVersion && <span>Garage {garageVersion}</span>}
          </div>
        )}
      </div>
    </aside>
  );
}
