import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BreadcrumbItem } from '@/components/ui/breadcrumb';
import { usePermissions } from '@/hooks/usePermissions';
import { NoAccess } from '@/pages/NoAccess';
import { buildAppBreadcrumbs } from '@/lib/breadcrumbs';

function useCrumbs(): BreadcrumbItem[] {
  const location = useLocation();
  return buildAppBreadcrumbs(location.pathname, location.search);
}

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const crumbs = useCrumbs();
  const { noAccess } = usePermissions();

  return (
    <div className="app-viewport flex min-h-0 overflow-hidden bg-[var(--background)]">
      <Button
        variant="ghost"
        size="icon"
        className="fixed left-3 top-3 z-50 md:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        isOpen={sidebarOpen}
        isCollapsed={sidebarCollapsed}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapse={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />
      <div id="app-workspace" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar crumbs={crumbs} />
        <div id="app-content" className="relative min-h-0 flex-1">
          <main className="app-scroll-region absolute inset-0 overflow-y-auto scrollbar-thin">
            {noAccess ? <NoAccess /> : <Outlet />}
          </main>
        </div>
      </div>
    </div>
  );
}
