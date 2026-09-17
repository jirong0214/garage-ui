import {fireEvent, render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ObjectBrowserView} from './ObjectBrowserView';

const props = {
  bucketName: 'demo',
  canShare: false,
  canMove: false,
  canRename: false,
  transferDestinationBuckets: [],
  objects: [{key: 'notes.txt', size: 10, lastModified: '2026-09-11T00:00:00Z'}],
  continuousObjects: [{key: 'notes.txt', size: 10, lastModified: '2026-09-11T00:00:00Z'}],
  currentPath: '',
  searchQuery: '',
  filterQuery: '',
  deepSearch: false,
  itemsPerPage: 25,
  onSearchChange: vi.fn(),
  onDeepSearchChange: vi.fn(),
  onNavigateToFolder: vi.fn(),
  uploadTasks: [],
  onDeleteObject: vi.fn(),
  onRefresh: vi.fn(),
  onTransferComplete: vi.fn(),
  onPageChange: vi.fn(),
  onLoadMore: vi.fn(),
  onItemsPerPageChange: vi.fn(),
  isRefreshing: false,
  isNavigating: false,
  continuousIsTruncated: false,
  isLoadingMore: false,
  loadMoreError: null,
};
function browser() {
  return (
    <MemoryRouter>
      <ObjectBrowserView {...props} />
    </MemoryRouter>
  );
}

describe('ObjectBrowserView preferences', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  it('defaults to list and persists the chosen view', () => {
    const {unmount} = render(browser());
    expect(screen.getByRole('button', {name: 'List view'})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByPlaceholderText('Search by name prefix…').closest('.sticky')).toHaveClass('top-0', 'z-20');
    fireEvent.click(screen.getByRole('button', {name: 'Icon view'}));
    expect(screen.getByRole('list', {name: 'Objects'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /^notes.txt/}), {metaKey: true});
    expect(screen.getByRole('button', {name: /^notes.txt/})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Delete'})).toHaveClass('bg-[var(--destructive)]');
    expect(localStorage.getItem('garage-ui:objects-view')).toBe('grid');
    unmount();
    render(browser());
    expect(screen.getByRole('button', {name: 'Icon view'})).toHaveAttribute('aria-pressed', 'true');
  });
  it('ignores an invalid stored preference', () => {
    localStorage.setItem('garage-ui:objects-view', 'broken');
    render(browser());
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('supports touch-friendly selection mode and exits with Escape or the toolbar button', () => {
    render(browser());

    fireEvent.click(screen.getByRole('button', {name: 'Select'}));
    expect(screen.getByRole('button', {name: 'Exit selection'})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(screen.getByText('0 selected').closest('.sticky')).toHaveClass(
      'bg-[var(--background)]',
      'border-b-2',
      'border-b-[var(--primary)]',
    );
    expect(screen.getByText('0 selected').closest('.sticky')).not.toHaveClass(
      'bg-[var(--accent-primary-soft)]',
    );
    expect(screen.queryByPlaceholderText('Search by name prefix…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'List view'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'notes.txt'}));
    expect(screen.getByText('notes.txt').closest('tr')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', {name: 'Delete'})).toBeInTheDocument();

    fireEvent.keyDown(document, {key: 'Escape'});
    expect(screen.getByRole('button', {name: 'Select'})).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('notes.txt').closest('tr')).toHaveAttribute('aria-selected', 'false');
    expect(screen.queryByRole('button', {name: 'Delete'})).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {name: 'Select'}));
    fireEvent.click(screen.getByRole('button', {name: 'notes.txt'}));
    fireEvent.click(screen.getByRole('button', {name: 'Exit selection'}));
    expect(screen.getByText('notes.txt').closest('tr')).toHaveAttribute('aria-selected', 'false');
  });

  it('opens the icon context menu without entering selection mode', () => {
    render(browser());
    fireEvent.click(screen.getByRole('button', {name: 'Icon view'}));

    fireEvent.contextMenu(screen.getByText('notes.txt').closest('li')!);

    expect(screen.getByRole('button', {name: 'Select'})).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', {name: 'Exit selection'})).not.toBeInTheDocument();
    expect(screen.getByRole('menu', {name: 'Object actions'})).toBeInTheDocument();
  });

  it('places the view switch beside refresh after the creation actions', () => {
    render(
      <MemoryRouter>
        <ObjectBrowserView
          {...props}
          onUploadFiles={vi.fn().mockResolvedValue(true)}
          onCreateDirectory={vi.fn().mockResolvedValue(true)}
        />
      </MemoryRouter>,
    );

    const addDirectory = screen.getByRole('button', {name: 'Add Directory'});
    const select = screen.getByRole('button', {name: 'Select'});
    const listView = screen.getByRole('button', {name: 'List view'});
    const iconView = screen.getByRole('button', {name: 'Icon view'});
    const refresh = screen.getByRole('button', {name: 'Refresh'});
    expect(addDirectory).toHaveClass('border');
    expect(addDirectory.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.compareDocumentPosition(listView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(listView.compareDocumentPosition(iconView) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(iconView.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(select.closest('.border-l')).toHaveClass('pl-3');
  });
});
