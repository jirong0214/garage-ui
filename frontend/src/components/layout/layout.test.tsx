import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {Layout} from './layout';

vi.mock('./sidebar', () => ({
  Sidebar: () => <aside>Sidebar</aside>,
}));

vi.mock('./top-bar', () => ({
  TopBar: () => <header>Top bar</header>,
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({noAccess: false}),
}));

describe('Layout', () => {
  it('uses a dynamic viewport with one constrained content scroller', () => {
    render(
      <MemoryRouter>
        <Layout />
      </MemoryRouter>,
    );

    const topBar = screen.getByText('Top bar');
    const viewport = topBar.parentElement?.parentElement;
    const main = topBar.nextElementSibling;

    expect(viewport).toHaveClass('app-viewport', 'min-h-0', 'overflow-hidden');
    expect(topBar.parentElement).toHaveClass('min-h-0');
    expect(main).toHaveClass('app-scroll-region', 'min-h-0', 'overflow-y-auto');
  });
});
