import {ObjectsGrid} from './ObjectsGrid';
import {ObjectsTable} from './ObjectsTable';
import {ObjectsPagination} from './ObjectsPagination';
import {useEffect, useMemo, useRef, useState, type MouseEvent} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {DropdownMenuItem, DropdownMenuSeparator} from '@/components/ui/dropdown-menu';
import {ContextMenuItem, ContextMenuSeparator} from '@/components/ui/context-menu';
import {Copy, Download, FolderIcon, Link2, MoveRight, Pencil, Trash2} from 'lucide-react';
import {downloadObject} from '@/lib/file-utils';
import type {Bucket, S3Object} from '@/types';
import {buildPublicObjectUrl, copyText} from '@/lib/utils';
import {toast} from 'sonner';
import {ShareObjectDialog} from './ShareObjectDialog';
import {ObjectTransferDialog, type ObjectTransferMode} from './ObjectTransferDialog';
import { useTranslation } from 'react-i18next';

export interface ObjectsContentProps {
  viewMode?: 'list' | 'grid';
  bucketName: string;
  publicBaseURL?: string;
  canShare: boolean;
  transferDestinationBuckets?: Bucket[];
  canMove?: boolean;
  canRename?: boolean;
  objects: S3Object[];
  continuousObjects?: S3Object[];
  currentPath: string;
  searchQuery: string;
  filterQuery: string;
  deepSearch: boolean;
  selectedFileKeys: Set<string>;
  selectedFolderKeys: Set<string>;
  selectionMode?: boolean;
  isDragActive: boolean;
  isLoading?: boolean;
  isTruncated?: boolean;
  nextContinuationToken?: string;
  continuousIsTruncated?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  itemsPerPage: number;
  onNavigateToFolder: (key: string) => void;
  // Optional so the parent can withhold them when the user lacks delete
  // permission; canDelete (below) is derived from onDeleteObject.
  onDeleteObject?: (object: S3Object) => void;
  onDeleteFolder?: (object: S3Object) => void;
  onCopyFolder?: (object: S3Object) => void;
  onMoveFolder?: (object: S3Object) => void;
  onToggleFileSelection: (key: string) => void;
  onToggleFolderSelection: (key: string) => void;
  onEnterSelectionMode?: () => void;
  onReplaceSelection?: (object: S3Object) => void;
  onSelectAll?: (fileKeys: string[], folderKeys: string[]) => void;
  onPageChange: (token?: string) => void;
  onLoadMore?: () => Promise<void>;
  onItemsPerPageChange: (count: number) => void;
  onTransferComplete?: () => Promise<void>;
  initialPageToken?: string;
  initialItemsPerPage?: number;
}

type SortColumn = 'name' | 'size' | 'modified';
type SortDirection = 'asc' | 'desc';
interface SortPreference {
  column: SortColumn;
  direction: SortDirection;
}

const SORT_STORAGE_KEY = 'garage-ui:objects-sort';
const DEFAULT_SORT: SortPreference = {column: 'name', direction: 'asc'};

function loadSortPreference(): SortPreference {
  try {
    const stored = JSON.parse(
      localStorage.getItem(SORT_STORAGE_KEY) ?? 'null',
    ) as Partial<SortPreference> | null;
    const column = stored?.column;
    const direction = stored?.direction;
    if (
      (column === 'name' || column === 'size' || column === 'modified') &&
      (direction === 'asc' || direction === 'desc')
    ) {
      return {column, direction};
    }
  } catch {
    // Ignore unavailable storage and malformed values.
  }
  return DEFAULT_SORT;
}

function saveSortPreference(preference: SortPreference) {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // Sorting still works when storage is unavailable.
  }
}

export function ObjectsContent({
  viewMode = 'list',
  bucketName,
  publicBaseURL,
  canShare,
  transferDestinationBuckets = [],
  canMove = false,
  canRename = false,
  objects,
  continuousObjects = objects,
  currentPath,
  searchQuery,
  filterQuery,
  deepSearch,
  selectedFileKeys,
  selectedFolderKeys,
  selectionMode = false,
  isDragActive,
  isLoading = false,
  isTruncated = false,
  nextContinuationToken,
  continuousIsTruncated = false,
  isLoadingMore = false,
  loadMoreError = null,
  itemsPerPage,
  onNavigateToFolder,
  onDeleteObject,
  onDeleteFolder,
  onCopyFolder,
  onMoveFolder,
  onToggleFileSelection,
  onToggleFolderSelection,
  onEnterSelectionMode = () => undefined,
  onReplaceSelection = () => undefined,
  onPageChange,
  onLoadMore,
  onItemsPerPageChange,
  onTransferComplete,
  initialPageToken,
  initialItemsPerPage,
}: ObjectsContentProps) {
  const { t } = useTranslation(['objects', 'common']);
  const navigate = useNavigate();
  const location = useLocation();
  const canDelete = Boolean(onDeleteObject);
  const canSelect = canDelete || transferDestinationBuckets.length > 0 || canMove;
  const [sortPreference, setSortPreference] = useState<SortPreference>(loadSortPreference);
  const {column: sortColumn, direction: sortDirection} = sortPreference;
  // Store tokens for each page: [undefined (page 1), token1 (page 2), token2 (page 3), ...]
  const [pageTokens, setPageTokens] = useState<(string | undefined)[]>([undefined]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const initializedRef = useRef(false);
  const [shareObject, setShareObject] = useState<S3Object | null>(null);
  const [transfer, setTransfer] = useState<{object: S3Object; mode: ObjectTransferMode} | null>(null);
  const [gridVisibleCount, setGridVisibleCount] = useState(itemsPerPage);

  const copyPublicURL = async (key: string) => {
    if (!publicBaseURL) return;
    try {
      await copyText(buildPublicObjectUrl(publicBaseURL, key));
      toast.success(t('objects:publicUrlCopied'));
    } catch {
      toast.error(t('common:errors.copyFailed'));
    }
  };

  // Initialize from URL params on first load
  useEffect(() => {
    if (initializedRef.current) return;
    if (initialItemsPerPage && initialItemsPerPage !== itemsPerPage) {
      onItemsPerPageChange(initialItemsPerPage);
    }
    if (initialPageToken && initialPageToken !== nextContinuationToken) {
      // If we have an initial page token, trigger page change
      onPageChange(initialPageToken);
    }
    initializedRef.current = true;
  }, [
    initialPageToken,
    initialItemsPerPage,
    itemsPerPage,
    nextContinuationToken,
    onPageChange,
    onItemsPerPageChange,
  ]);

  const filteredObjects = useMemo(() => {
    // Filter on the debounced query, not the raw input, so the list only
    // updates once typing pauses (matches the debounced server request).
    const query = filterQuery.toLowerCase();
    const filtered = objects.filter((obj) => obj.key.toLowerCase().includes(query));
    return [...filtered].sort((a, b) => {
      const aIsFolder = a.isFolder ? 1 : 0;
      const bIsFolder = b.isFolder ? 1 : 0;
      if (aIsFolder !== bIsFolder) return bIsFolder - aIsFolder;

      let compareValue = 0;
      switch (sortColumn) {
        case 'name': {
          const aName = a.key.replace(currentPath, '').replace(/\/$/, '').toLowerCase();
          const bName = b.key.replace(currentPath, '').replace(/\/$/, '').toLowerCase();
          compareValue = aName.localeCompare(bName);
          break;
        }
        case 'size':
          compareValue = a.size - b.size;
          break;
        case 'modified': {
          const aDate = new Date(a.lastModified).getTime();
          const bDate = new Date(b.lastModified).getTime();
          compareValue = aDate - bDate;
          break;
        }
      }

      return sortDirection === 'asc' ? compareValue : -compareValue;
    });
  }, [objects, filterQuery, sortColumn, sortDirection, currentPath]);

  const filteredContinuousObjects = useMemo(() => {
    const query = filterQuery.toLowerCase();
    const filtered = continuousObjects.filter((obj) => obj.key.toLowerCase().includes(query));
    return [...filtered].sort((a, b) => {
      const folderOrder = Number(Boolean(b.isFolder)) - Number(Boolean(a.isFolder));
      if (folderOrder !== 0) return folderOrder;
      let value = 0;
      if (sortColumn === 'name') {
        value = a.key.localeCompare(b.key);
      } else if (sortColumn === 'size') {
        value = a.size - b.size;
      } else {
        value = new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime();
      }
      return sortDirection === 'asc' ? value : -value;
    });
  }, [continuousObjects, filterQuery, sortColumn, sortDirection]);

  // Effect 2: Reset pagination on path navigation or when a search begins/ends.
  // Search results are a single flat list, so page-token state must not leak
  // across the search/browse boundary.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset local pagination when its server-side scope changes */
    setPageTokens([undefined]);
    setCurrentPageIndex(0);
    setGridVisibleCount(itemsPerPage);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [currentPath, searchQuery, deepSearch, itemsPerPage]);

  // Update page tokens when we get a new next token
  useEffect(() => {
    if (nextContinuationToken && isTruncated) {
      // The token arrives from the server after a page request and extends navigation history.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPageTokens((prev) => {
        const newTokens = [...prev];
        // Only add the token if we don't have it yet
        const nextIndex = currentPageIndex + 1;
        if (nextIndex >= newTokens.length) {
          newTokens[nextIndex] = nextContinuationToken;
        }
        return newTokens;
      });
    }
  }, [nextContinuationToken, isTruncated, currentPageIndex]);

  // Prefix search and normal browsing are server-paginated (query folded into
  // the prefix; continuation tokens for pages). Deep search loads the whole
  // capped result set in one response, so we paginate that on the client by
  // itemsPerPage instead of dumping every match at once.
  const isDeepSearching = deepSearch && searchQuery.trim().length > 0;
  const clientPaginated = isDeepSearching;
  const totalPages = clientPaginated ? Math.max(1, Math.ceil(filteredObjects.length / itemsPerPage)) : 1;
  // Clamp during render (not via a setState effect) so a shrinking result set
  // or a larger page size can't strand us on an out-of-range page.
  const pageIndex = clientPaginated ? Math.min(currentPageIndex, totalPages - 1) : currentPageIndex;
  const pageObjects = clientPaginated
    ? filteredObjects.slice(pageIndex * itemsPerPage, (pageIndex + 1) * itemsPerPage)
    : filteredObjects;
  const hasPrevious = pageIndex > 0;
  const hasNext = clientPaginated ? pageIndex < totalPages - 1 : isTruncated;
  const gridObjects = clientPaginated
    ? filteredContinuousObjects.slice(0, gridVisibleCount)
    : filteredContinuousObjects;
  const gridHasMore = clientPaginated
    ? gridVisibleCount < filteredContinuousObjects.length
    : continuousIsTruncated;
  const loadMoreGridObjects = async () => {
    if (clientPaginated) {
      setGridVisibleCount((count) => Math.min(count + itemsPerPage, filteredContinuousObjects.length));
      return;
    }
    await onLoadMore?.();
  };

  const handleNextPage = () => {
    if (!hasNext) return;
    // Client-paginated (deep search): just advance the slice, no server fetch.
    if (clientPaginated) {
      setCurrentPageIndex(pageIndex + 1);
      window.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }
    if (nextContinuationToken) {
      const nextIndex = currentPageIndex + 1;
      setCurrentPageIndex(nextIndex);
      onPageChange(nextContinuationToken);
      window.scrollTo({top: 0, behavior: 'smooth'});
    }
  };

  const handlePreviousPage = () => {
    if (!hasPrevious) return;
    if (clientPaginated) {
      setCurrentPageIndex(pageIndex - 1);
      window.scrollTo({top: 0, behavior: 'smooth'});
      return;
    }
    const prevIndex = currentPageIndex - 1;
    setCurrentPageIndex(prevIndex);
    onPageChange(pageTokens[prevIndex]);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleItemsPerPageChange = (value: string) => {
    onItemsPerPageChange(Number(value));
    setPageTokens([undefined]); // Reset to first page
    setCurrentPageIndex(0);
  };

  const handleSort = (column: SortColumn) => {
    const nextPreference: SortPreference =
      sortColumn === column
        ? {column, direction: sortDirection === 'asc' ? 'desc' : 'asc'}
        : {column, direction: 'asc'};
    setSortPreference(nextPreference);
    saveSortPreference(nextPreference);
  };

  const openObject = (obj: S3Object) => {
    if (obj.isFolder) {
      onNavigateToFolder(obj.key);
      return;
    }
    navigate(`/buckets/${bucketName}/objects/${encodeURIComponent(obj.key)}`, {
      state: {objectListHref: `${location.pathname}${location.search}`},
    });
  };

  const activateObject = (obj: S3Object, event: MouseEvent<HTMLElement>) => {
    const modifierSelection = event.metaKey || event.ctrlKey;
    if (canSelect && (selectionMode || modifierSelection)) {
      if (modifierSelection) onEnterSelectionMode();
      if (obj.isFolder) onToggleFolderSelection(obj.key);
      else onToggleFileSelection(obj.key);
      return;
    }
    openObject(obj);
  };

  const renderGridContextMenu = (obj: S3Object, close: () => void) => {
    const run = (action: () => void | Promise<void>) => {
      close();
      void action();
    };

    return obj.isFolder ? (
      <>
        <ContextMenuItem onClick={() => run(() => onNavigateToFolder(obj.key))}>
          <FolderIcon /> {t('objects:open')}
        </ContextMenuItem>
        {onCopyFolder && (
          <ContextMenuItem onClick={() => run(() => onCopyFolder(obj))}>
            <Copy /> {t('objects:copy')}…
          </ContextMenuItem>
        )}
        {onMoveFolder && (
          <ContextMenuItem onClick={() => run(() => onMoveFolder(obj))}>
            <MoveRight /> {t('objects:move')}…
          </ContextMenuItem>
        )}
        {onDeleteFolder && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive" onClick={() => run(() => onDeleteFolder(obj))}>
              <Trash2 /> {t('objects:deleteFolder')}
            </ContextMenuItem>
          </>
        )}
      </>
    ) : (
      <>
        <ContextMenuItem onClick={() => run(() => downloadObject(bucketName, obj.key))}>
          <Download /> {t('objects:download')}
        </ContextMenuItem>
        {publicBaseURL && (
          <ContextMenuItem onClick={() => run(() => copyPublicURL(obj.key))}>
            <Copy /> {t('objects:publicUrl')}
          </ContextMenuItem>
        )}
        {canShare && (
          <ContextMenuItem onClick={() => run(() => setShareObject(obj))}>
            <Link2 /> {t('objects:share')}
          </ContextMenuItem>
        )}
        {(canRename || transferDestinationBuckets.length > 0 || canMove) && (
          <ContextMenuSeparator />
        )}
        {canRename && (
          <ContextMenuItem onClick={() => run(() => setTransfer({object: obj, mode: 'rename'}))}>
            <Pencil /> {t('objects:rename')}…
          </ContextMenuItem>
        )}
        {transferDestinationBuckets.length > 0 && (
          <ContextMenuItem onClick={() => run(() => setTransfer({object: obj, mode: 'copy'}))}>
            <Copy /> {t('objects:copy')}…
          </ContextMenuItem>
        )}
        {canMove && (
          <ContextMenuItem onClick={() => run(() => setTransfer({object: obj, mode: 'move'}))}>
            <MoveRight /> {t('objects:move')}…
          </ContextMenuItem>
        )}
        {onDeleteObject && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem className="text-destructive" onClick={() => run(() => onDeleteObject(obj))}>
              <Trash2 /> {t('objects:delete')}
            </ContextMenuItem>
          </>
        )}
      </>
    );
  };

  const renderMutationItems = (obj: S3Object) =>
    obj.isFolder ? (
      <>
        <DropdownMenuItem onClick={() => onNavigateToFolder(obj.key)}>
          <FolderIcon className="h-4 w-4" />
          {t('objects:open')}
        </DropdownMenuItem>
        {onCopyFolder && (
          <DropdownMenuItem onClick={() => onCopyFolder(obj)}>
            <Copy className="h-4 w-4" />
            {t('objects:copy')}…
          </DropdownMenuItem>
        )}
        {onMoveFolder && (
          <DropdownMenuItem onClick={() => onMoveFolder(obj)}>
            <MoveRight className="h-4 w-4" />
            {t('objects:move')}…
          </DropdownMenuItem>
        )}
        {onDeleteFolder && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteFolder(obj)}>
              <Trash2 className="h-4 w-4" />
              {t('objects:deleteFolder')}
            </DropdownMenuItem>
          </>
        )}
      </>
    ) : (
      <>
        {canRename && (
          <DropdownMenuItem onClick={() => setTransfer({object: obj, mode: 'rename'})}>
            <Pencil className="h-4 w-4" />
            {t('objects:rename')}…
          </DropdownMenuItem>
        )}
        {transferDestinationBuckets.length > 0 && (
          <DropdownMenuItem onClick={() => setTransfer({object: obj, mode: 'copy'})}>
            <Copy className="h-4 w-4" />
            {t('objects:copy')}…
          </DropdownMenuItem>
        )}
        {canMove && (
          <DropdownMenuItem onClick={() => setTransfer({object: obj, mode: 'move'})}>
            <MoveRight className="h-4 w-4" />
            {t('objects:move')}…
          </DropdownMenuItem>
        )}
        {onDeleteObject && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDeleteObject(obj)}>
              <Trash2 className="h-4 w-4" />
              {t('objects:delete')}
            </DropdownMenuItem>
          </>
        )}
      </>
    );

  return (
    <>
      {viewMode === 'grid' ? (
        <ObjectsGrid
          {...{
            bucketName,
            currentPath,
            pageObjects: gridObjects,
            canSelect,
            selectedFileKeys,
            selectedFolderKeys,
            sortColumn,
            sortDirection,
            handleSort,
            isLoading,
            searchQuery,
            isDragActive,
          }}
          hasMore={gridHasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={loadMoreGridObjects}
          totalLoaded={gridObjects.length}
          isCapped={clientPaginated && isTruncated}
          resetKey={JSON.stringify([currentPath, filterQuery, deepSearch, itemsPerPage])}
          onActivate={activateObject}
          onSelectForContextMenu={onReplaceSelection}
          renderContextMenu={renderGridContextMenu}
        />
      ) : (
        <ObjectsTable
          {...{
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
            onNavigateToFolder,
            publicBaseURL,
            canShare,
            canRename,
            transferDestinationBuckets,
            canMove,
            onDeleteObject,
            copyPublicURL,
            renderMutationItems,
          }}
          onShare={setShareObject}
          onActivate={activateObject}
        />
      )}

      {viewMode === 'list' && (
        <ObjectsPagination
          totalItems={filteredObjects.length}
          visibleItems={pageObjects.length}
          {...{
            hasPrevious,
            hasNext,
            itemsPerPage,
            isDeepSearching,
            pageIndex,
            totalPages,
            isTruncated,
            handleItemsPerPageChange,
            handlePreviousPage,
            handleNextPage,
          }}
        />
      )}
      <ShareObjectDialog
        open={shareObject !== null}
        onOpenChange={(open) => {
          if (!open) setShareObject(null);
        }}
        bucketName={bucketName}
        objectKey={shareObject?.key ?? ''}
      />
      <ObjectTransferDialog
        open={transfer !== null}
        onOpenChange={(open) => {
          if (!open) setTransfer(null);
        }}
        mode={transfer?.mode ?? 'copy'}
        sourceBucket={bucketName}
        sourceKey={transfer?.object.key ?? ''}
        destinationBuckets={transferDestinationBuckets}
        onCompleted={() => {
          void onTransferComplete?.();
        }}
      />
    </>
  );
}
