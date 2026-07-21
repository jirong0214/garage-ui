import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {Layout} from './layout';

vi.mock('./sidebar', () => ({
  Sidebar: ({isCollapsed, onToggleCollapse}: {isCollapsed: boolean; onToggleCollapse: () => void}) => (
    <button type="button" onClick={onToggleCollapse}>{isCollapsed ? 'Expand navigation' : 'Collapse navigation'}</button>
  ),
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
    const workspace = topBar.parentElement;
    const viewport = workspace?.parentElement;
    const contentFrame = topBar.nextElementSibling;
    const main = contentFrame?.firstElementChild;

    expect(viewport).toHaveClass('app-viewport', 'min-h-0', 'overflow-hidden');
    expect(workspace).toHaveAttribute('id', 'app-workspace');
    expect(workspace).toHaveClass('relative', 'min-h-0');
    expect(contentFrame).toHaveAttribute('id', 'app-content');
    expect(contentFrame).toHaveClass('relative', 'min-h-0');
    expect(main).toHaveClass('app-scroll-region', 'absolute', 'inset-0', 'overflow-y-auto');

    fireEvent.click(screen.getByRole('button', {name: 'Collapse navigation'}));
    expect(screen.getByRole('button', {name: 'Expand navigation'})).toBeInTheDocument();
  });
});
