import {act, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ObjectsGrid} from './ObjectsGrid';

const baseProps = {
  bucketName: 'photos',
  currentPath: '',
  pageObjects: [{key: 'photo.jpg', size: 10, lastModified: '2026-09-11T00:00:00Z'}],
  canSelect: false,
  selectedFileKeys: new Set<string>(),
  selectedFolderKeys: new Set<string>(),
  onActivate: vi.fn(),
  renderContextMenu: () => null,
  sortColumn: 'name' as const,
  sortDirection: 'asc' as const,
  handleSort: vi.fn(),
  isLoading: false,
  searchQuery: '',
  isDragActive: false,
  hasMore: true,
  isLoadingMore: false,
  loadMoreError: null,
  onLoadMore: vi.fn().mockResolvedValue(undefined),
  totalLoaded: 1,
  isCapped: false,
  resetKey: 'root',
};

describe('ObjectsGrid continuous loading', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('loads the next batch when the sentinel approaches the viewport', () => {
    let intersect: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    render(<ObjectsGrid {...baseProps} />);
    act(() => intersect([{isIntersecting: true}] as IntersectionObserverEntry[], {} as IntersectionObserver));
    expect(baseProps.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('keeps loaded objects visible and offers an explicit retry after failure', () => {
    const onLoadMore = vi.fn().mockResolvedValue(undefined);
    render(<ObjectsGrid {...baseProps} loadMoreError={new Error('offline')} onLoadMore={onLoadMore} />);
    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('Could not load more objects.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {name: 'Retry'}));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('opens actions on right click without entering selection', () => {
    render(
      <ObjectsGrid
        {...baseProps}
        canSelect
        renderContextMenu={() => <button type="button">Inspect</button>}
      />,
    );

    expect(screen.queryByRole('button', {name: /Actions for/})).not.toBeInTheDocument();
    fireEvent.contextMenu(screen.getByText('photo.jpg').closest('li')!);
    expect(screen.getByRole('menu', {name: 'Object actions'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Inspect'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: /^photo.jpg/})).toHaveAttribute('aria-pressed', 'false');
  });

  it('preserves an existing multi-selection when opening its context menu', () => {
    render(
      <ObjectsGrid
        {...baseProps}
        canSelect
        selectedFileKeys={new Set(['photo.jpg', 'another.jpg'])}
        renderContextMenu={() => null}
      />,
    );

    fireEvent.contextMenu(screen.getByText('photo.jpg').closest('li')!);
    expect(screen.getByRole('button', {name: /^photo.jpg/})).toHaveAttribute('aria-pressed', 'true');
  });

  it('blurs a pointer-triggered object when its context menu closes', () => {
    render(
      <ObjectsGrid
        {...baseProps}
        renderContextMenu={() => <button type="button">Inspect</button>}
      />,
    );

    const objectButton = screen.getByRole('button', {name: /^photo.jpg/});
    objectButton.focus();
    fireEvent.contextMenu(objectButton);
    fireEvent.keyDown(document, {key: 'Escape'});

    expect(document.activeElement).not.toBe(objectButton);
  });

  it('preserves keyboard focus when a keyboard context menu closes', () => {
    render(
      <ObjectsGrid
        {...baseProps}
        renderContextMenu={() => <button type="button">Inspect</button>}
      />,
    );

    const objectButton = screen.getByRole('button', {name: /^photo.jpg/});
    objectButton.focus();
    fireEvent.keyDown(objectButton, {key: 'ContextMenu'});
    fireEvent.keyDown(document, {key: 'Escape'});

    expect(document.activeElement).toBe(objectButton);
  });
});
