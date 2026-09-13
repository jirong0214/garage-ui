import {fireEvent, render, screen, within} from '@testing-library/react';
import {MemoryRouter, Route, Routes, useLocation} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {ObjectsContent, type ObjectsContentProps} from './ObjectsContent';

function props(overrides: Partial<ObjectsContentProps> = {}): ObjectsContentProps {
  return {
    bucketName: 'demo',
    canShare: false,
    objects: [],
    currentPath: '',
    searchQuery: '',
    filterQuery: '',
    deepSearch: false,
    selectedFileKeys: new Set(),
    selectedFolderKeys: new Set(),
    isDragActive: false,
    itemsPerPage: 10,
    onNavigateToFolder: vi.fn(),
    onToggleFileSelection: vi.fn(),
    onToggleFolderSelection: vi.fn(),
    onEnterSelectionMode: vi.fn(),
    onReplaceSelection: vi.fn(),
    onSelectAll: vi.fn(),
    onPageChange: vi.fn(),
    onItemsPerPageChange: vi.fn(),
    ...overrides,
  };
}
const objects = Array.from({length: 23}, (_, index) => ({
  key: `file-${String(index).padStart(2, '0')}.txt`,
  size: index,
  lastModified: '2026-09-11T00:00:00Z',
}));

describe('ObjectsContent view switching', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  it('turns deep-search pagination into an incremental grid while preserving sort and selection', () => {
    const initial = props({
      objects,
      deepSearch: true,
      searchQuery: 'file',
      filterQuery: 'file',
      onDeleteObject: vi.fn(),
      selectedFileKeys: new Set(['file-12.txt']),
    });
    const {rerender} = render(
      <MemoryRouter>
        <ObjectsContent {...initial} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('columnheader', {name: 'Size'}));
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ObjectsContent {...initial} viewMode="grid" />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Page 2 of 3/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Sort by size, ascending'})).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('file-00.txt')).toBeInTheDocument();
    expect(screen.queryByText('file-10.txt')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Load more'}));
    expect(screen.getByText('file-10.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^file-12.txt/})).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: /^file-10.txt/}), {ctrlKey: true});
    expect(initial.onToggleFileSelection).toHaveBeenCalledWith('file-10.txt');
    expect(initial.onEnterSelectionMode).toHaveBeenCalledTimes(1);
    rerender(
      <MemoryRouter>
        <ObjectsContent {...initial} viewMode="list" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText('file-12.txt').closest('tr')).toHaveAttribute('aria-selected', 'true');
    expect(initial.onPageChange).not.toHaveBeenCalled();
  });

  it('preserves server pagination tokens when switching views', () => {
    const initial = props({
      objects: objects.slice(0, 10),
      isTruncated: true,
      nextContinuationToken: 'next-page',
    });
    const {rerender} = render(
      <MemoryRouter>
        <ObjectsContent {...initial} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', {name: 'Next'}));
    expect(initial.onPageChange).toHaveBeenLastCalledWith('next-page');
    rerender(
      <MemoryRouter>
        <ObjectsContent {...initial} objects={objects.slice(10, 20)} viewMode="grid" />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/Page 2/)).not.toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ObjectsContent {...initial} objects={objects.slice(10, 20)} viewMode="list" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Page 2 • Showing 10 items/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Previous'}));
    expect(initial.onPageChange).toHaveBeenLastCalledWith(undefined);
  });

  it('keeps folders first and preserves relative paths in deep search', () => {
    render(
      <MemoryRouter>
        <ObjectsContent
          {...props({
            viewMode: 'grid',
            currentPath: 'root/',
            objects: [
              {...objects[0], key: 'root/sub/report.txt'},
              {...objects[1], key: 'root/a/', isFolder: true},
            ],
          })}
        />
      </MemoryRouter>,
    );
    const items = within(screen.getByRole('list', {name: 'Objects'})).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('a');
    expect(items[1]).toHaveTextContent('sub/report.txt');
  });

  it('withholds mutation and selection controls from read-only users', () => {
    render(
      <MemoryRouter>
        <ObjectsContent {...props({viewMode: 'grid', objects: objects.slice(0, 1)})} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText('file-00.txt').closest('li')!);
    expect(screen.getByText('Download')).toBeInTheDocument();
    for (const name of ['Delete', 'Copy…', 'Move…', 'Rename…', 'Share'])
      expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('uses the same folder callbacks in the grid menu', () => {
    const initial = props({
      viewMode: 'grid',
      objects: [{...objects[0], key: 'folder/', isFolder: true}],
      onCopyFolder: vi.fn(),
      onMoveFolder: vi.fn(),
      onDeleteFolder: vi.fn(),
    });
    render(
      <MemoryRouter>
        <ObjectsContent {...initial} />
      </MemoryRouter>,
    );
    fireEvent.contextMenu(screen.getByText('folder').closest('li')!);
    fireEvent.click(screen.getByText('Copy…'));
    expect(initial.onCopyFolder).toHaveBeenCalledWith(initial.objects[0]);
    fireEvent.contextMenu(screen.getByText('folder').closest('li')!);
    fireEvent.click(screen.getByText('Delete folder'));
    expect(initial.onDeleteFolder).toHaveBeenCalledWith(initial.objects[0]);
  });

  it('renders consistent separators in the icon-view context menu', () => {
    render(
      <MemoryRouter>
        <ObjectsContent
          {...props({
            viewMode: 'grid',
            objects: objects.slice(0, 1),
            canRename: true,
            canMove: true,
            transferDestinationBuckets: [
              {name: 'archive', creationDate: '2026-01-01T00:00:00Z', websiteAccess: false},
            ],
            onDeleteObject: vi.fn(),
          })}
        />
      </MemoryRouter>,
    );

    fireEvent.contextMenu(screen.getByText('file-00.txt').closest('li')!);
    const separators = screen.getAllByRole('separator');
    expect(separators).toHaveLength(2);
    for (const separator of separators) {
      expect(separator).toHaveClass('border-t', 'border-[var(--border)]');
      expect(separator).not.toHaveClass('h-px');
    }
  });

  it('opens details with the exact return URL from icon mode', () => {
    function Details() {
      const location = useLocation();
      return <div>{location.state.objectListHref}</div>;
    }
    render(
      <MemoryRouter initialEntries={['/buckets/demo?prefix=docs%2F&page=token&limit=10']}>
        <Routes>
          <Route
            path="/buckets/demo"
            element={<ObjectsContent {...props({viewMode: 'grid', objects: objects.slice(0, 1)})} />}
          />
          <Route path="/buckets/demo/objects/:key" element={<Details />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', {name: /^file-00.txt/}));
    expect(screen.getByText('/buckets/demo?prefix=docs%2F&page=token&limit=10')).toBeInTheDocument();
  });
});
