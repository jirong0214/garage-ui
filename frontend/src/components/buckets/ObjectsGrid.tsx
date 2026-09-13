import {useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode} from 'react';
import {Loader2, RotateCw} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {ContextMenu} from '@/components/ui/context-menu';
import {formatBytes} from '@/lib/file-utils';
import type {S3Object} from '@/types';
import {ObjectThumbnail} from './ObjectThumbnail';

interface Props {
  bucketName: string;
  currentPath: string;
  pageObjects: S3Object[];
  canSelect: boolean;
  selectedFileKeys: Set<string>;
  selectedFolderKeys: Set<string>;
  sortColumn: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  handleSort: (column: 'name' | 'size' | 'modified') => void;
  isLoading: boolean;
  searchQuery: string;
  isDragActive: boolean;
  onActivate?: (object: S3Object, event: MouseEvent<HTMLElement>) => void;
  onSelectForContextMenu?: (object: S3Object) => void;
  renderContextMenu?: (object: S3Object, close: () => void) => ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMoreError: Error | null;
  onLoadMore: () => Promise<void>;
  totalLoaded: number;
  isCapped: boolean;
  resetKey: string;
}

export function ObjectsGrid({
  bucketName,
  currentPath,
  pageObjects,
  canSelect,
  selectedFileKeys,
  selectedFolderKeys,
  sortColumn,
  sortDirection,
  handleSort,
  isLoading,
  searchQuery,
  isDragActive,
  onActivate = () => undefined,
  onSelectForContextMenu = () => undefined,
  renderContextMenu = () => null,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  totalLoaded,
  isCapped,
  resetKey,
}: Props) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [automaticLoadState, setAutomaticLoadState] = useState({key: resetKey, count: 0});
  const [contextTarget, setContextTarget] = useState<{object: S3Object; x: number; y: number} | null>(null);
  const automaticLoads = automaticLoadState.key === resetKey ? automaticLoadState.count : 0;
  const isSelected = (obj: S3Object) => (obj.isFolder ? selectedFolderKeys : selectedFileKeys).has(obj.key);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore || isLoadingMore || loadMoreError || automaticLoads >= 3) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setAutomaticLoadState({key: resetKey, count: automaticLoads + 1});
        void onLoadMore();
      },
      {rootMargin: '600px'},
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [automaticLoads, hasMore, isLoadingMore, loadMoreError, onLoadMore, resetKey]);

  const manuallyLoadMore = () => {
    setAutomaticLoadState({key: resetKey, count: 0});
    void onLoadMore();
  };

  const openContextMenu = (object: S3Object, x: number, y: number) => {
    if (canSelect && !isSelected(object)) onSelectForContextMenu(object);
    setContextTarget({object, x, y});
  };

  const handleContextKey = (event: KeyboardEvent<HTMLButtonElement>, object: S3Object) => {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    openContextMenu(object, bounds.left + bounds.width / 2, bounds.top + 32);
  };
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-3 border-b p-3">
        <div role="group" aria-label="Sort objects" className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-sm text-[var(--muted-foreground)]">Sort:</span>
          {(['name', 'size', 'modified'] as const).map((column) => (
            <Button
              key={column}
              size="sm"
              variant={sortColumn === column ? 'secondary' : 'ghost'}
              aria-pressed={sortColumn === column}
              aria-label={`Sort by ${column}${sortColumn === column ? `, ${sortDirection === 'asc' ? 'ascending' : 'descending'}` : ''}`}
              onClick={() => handleSort(column)}
            >
              {column === 'name' ? 'Name' : column === 'size' ? 'Size' : 'Modified'}{' '}
              {sortColumn === column && (sortDirection === 'asc' ? '↑' : '↓')}
            </Button>
          ))}
        </div>
      </div>
      {isLoading ? (
        <div
          role="status"
          className="flex justify-center items-center gap-2 py-12 text-[var(--muted-foreground)]"
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading objects...
        </div>
      ) : pageObjects.length === 0 ? (
        <div className="py-12 text-center text-[var(--muted-foreground)]">
          {searchQuery
            ? 'No objects found matching your search'
            : isDragActive
              ? 'Drop files or folders here'
              : 'No objects in this location'}
        </div>
      ) : (
        <ul
          aria-label="Objects"
          className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3 sm:p-4"
        >
          {pageObjects.map((obj) => {
            const name = (
              obj.key.startsWith(currentPath) ? obj.key.slice(currentPath.length) : obj.key
            ).replace(/\/$/, '');
            return (
              <li
                key={obj.key}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openContextMenu(obj, event.clientX, event.clientY);
                }}
                className={`relative min-w-0 rounded-lg border p-2 transition-colors ${isSelected(obj) ? 'border-[var(--primary)] bg-[var(--accent-primary-soft)] ring-1 ring-[var(--primary)]' : 'border-transparent hover:bg-[var(--accent)]'}`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected(obj)}
                  title={`${name} · ${canSelect ? 'Cmd/Ctrl-click to select · ' : ''}Right-click for actions`}
                  onClick={(event) => onActivate(obj, event)}
                  onKeyDown={(event) => handleContextKey(event, obj)}
                  className="flex w-full min-w-0 flex-col items-center gap-2 rounded-md p-1 text-center focus-visible:outline-2 focus-visible:outline-[var(--primary)]"
                >
                  <ObjectThumbnail bucketName={bucketName} object={obj} variant="grid" />
                  <span className="line-clamp-2 min-h-10 w-full break-all text-sm font-medium leading-5">
                    {name}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {obj.isFolder ? 'Directory' : formatBytes(obj.size)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {pageObjects.length > 0 && (
        <div
          ref={loadMoreRef}
          className="flex min-h-20 flex-col items-center justify-center gap-2 border-t p-4"
        >
          {isLoadingMore ? (
            <div role="status" className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading more objects…
            </div>
          ) : loadMoreError ? (
            <>
              <p className="text-sm text-destructive">Could not load more objects.</p>
              <Button size="sm" variant="secondary" onClick={manuallyLoadMore}>
                <RotateCw className="h-4 w-4" /> Retry
              </Button>
            </>
          ) : hasMore ? (
            <>
              <Button size="sm" variant="secondary" onClick={manuallyLoadMore}>
                Load more
              </Button>
              {automaticLoads < 3 && (
                <span className="text-xs text-[var(--muted-foreground)]">
                  More objects load as you scroll
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-[var(--muted-foreground)]">
              {isCapped
                ? `${totalLoaded} results loaded · Search limit reached, refine your query for more`
                : `All ${totalLoaded} objects loaded`}
            </span>
          )}
        </div>
      )}
      <ContextMenu
        open={contextTarget !== null}
        x={contextTarget?.x ?? 0}
        y={contextTarget?.y ?? 0}
        onOpenChange={(open) => {
          if (!open) setContextTarget(null);
        }}
      >
        {contextTarget && renderContextMenu(contextTarget.object, () => setContextTarget(null))}
      </ContextMenu>
    </>
  );
}
