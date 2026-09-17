import {useCallback, useEffect, useState} from 'react';
import {useDropzone} from 'react-dropzone';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {ObjectsContent} from './ObjectsContent';
import {CreateDirectoryDialog} from './CreateDirectoryDialog';
import {DeleteObjectDialog} from './DeleteObjectDialog';
import {ConfirmDialog} from '@/components/ui/confirm-dialog';
import {UploadProgress} from './UploadProgress';
import {
  LayoutGrid,
  List,
  ListChecks,
  Copy,
  FolderPlus,
  MoveRight,
  RotateCwIcon,
  ScanSearch,
  Search,
  Trash,
  Upload,
  X,
} from 'lucide-react';
import type {Bucket, ObjectJob, S3Object, UploadTask} from '@/types';
import {objectJobsApi} from '@/lib/api';
import {toast} from 'sonner';
import {ObjectJobDialog} from './ObjectJobDialog';
import {ObjectJobProgressDialog} from './ObjectJobProgressDialog';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type {InputHTMLAttributes} from 'react';

type DirectoryInputAttributes = InputHTMLAttributes<HTMLInputElement> & {
  webkitdirectory: string;
  directory: string;
  mozdirectory: string;
};

const directoryInputAttributes: DirectoryInputAttributes = {
  webkitdirectory: '',
  directory: '',
  mozdirectory: '',
};

async function readDirectoryEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) return entries;
    entries.push(...batch);
  }
}

async function traverseFileTree(item: FileSystemEntry, path: string, files: File[]): Promise<void> {
  if (item.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (item as FileSystemFileEntry).file(resolve, reject);
    });
    Object.defineProperty(file, 'webkitRelativePath', {
      value: path + file.name,
      writable: false,
    });
    files.push(file);
    return;
  }
  if (item.isDirectory) {
    const entries = await readDirectoryEntries((item as FileSystemDirectoryEntry).createReader());
    for (const entry of entries) {
      await traverseFileTree(entry, `${path}${item.name}/`, files);
    }
  }
}

interface ObjectBrowserViewProps {
  bucketName: string;
  publicBaseURL?: string;
  canShare: boolean;
  transferDestinationBuckets: Bucket[];
  canMove: boolean;
  canRename: boolean;
  objects: S3Object[];
  continuousObjects: S3Object[];
  currentPath: string;
  searchQuery: string;
  filterQuery: string;
  deepSearch: boolean;
  isLoading?: boolean;
  isTruncated?: boolean;
  nextContinuationToken?: string;
  continuousIsTruncated: boolean;
  isLoadingMore: boolean;
  loadMoreError: Error | null;
  itemsPerPage: number;
  onSearchChange: (query: string) => void;
  onDeepSearchChange: (enabled: boolean) => void;
  onNavigateToFolder: (path: string) => void;
  onUploadFiles?: (files: File[]) => Promise<boolean>;
  uploadTasks: UploadTask[];
  onDeleteObject?: (key: string) => Promise<boolean>;
  onCreateDirectory?: (name: string) => Promise<boolean>;
  onRefresh: () => Promise<void>;
  onTransferComplete: () => Promise<void>;
  onPageChange: (token?: string) => void;
  onLoadMore: () => Promise<void>;
  onItemsPerPageChange: (count: number) => void;
  isRefreshing: boolean;
  isNavigating: boolean;
  initialPageToken?: string;
  initialItemsPerPage?: number;
}

export function ObjectBrowserView({
  bucketName,
  publicBaseURL,
  canShare,
  transferDestinationBuckets,
  canMove,
  canRename,
  objects,
  continuousObjects,
  currentPath,
  searchQuery,
  filterQuery,
  deepSearch,
  isLoading = false,
  isTruncated = false,
  nextContinuationToken,
  continuousIsTruncated,
  isLoadingMore,
  loadMoreError,
  itemsPerPage,
  onSearchChange,
  onDeepSearchChange,
  onNavigateToFolder,
  onUploadFiles,
  uploadTasks,
  onDeleteObject,
  onCreateDirectory,
  onRefresh,
  onTransferComplete,
  onPageChange,
  onLoadMore,
  onItemsPerPageChange,
  isRefreshing,
  isNavigating,
  initialPageToken,
  initialItemsPerPage,
}: ObjectBrowserViewProps) {
  const { t } = useTranslation(['objects', 'common']);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem('garage-ui:objects-view') === 'grid' ? 'grid' : 'list';
    } catch {
      return 'list';
    }
  });
  const changeViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    try {
      localStorage.setItem('garage-ui:objects-view', mode);
    } catch {
      /* Storage is optional. */
    }
  };
  const [showUploadZone, setShowUploadZone] = useState(false);
  const [deleteObjectDialogOpen, setDeleteObjectDialogOpen] = useState(false);
  const [selectedObject, setSelectedObject] = useState<S3Object | null>(null);
  const [createDirDialogOpen, setCreateDirDialogOpen] = useState(false);
  const [selectedFileKeys, setSelectedFileKeys] = useState<Set<string>>(new Set());
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [jobSelection, setJobSelection] = useState<{
    operation: 'copy' | 'move';
    objects: string[];
    prefixes: string[];
  } | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('garage-ui:active-object-job');
    } catch {
      return null;
    }
  });
  // Holds the keys/prefixes awaiting confirmation in the bulk-delete dialog.
  const [pendingDelete, setPendingDelete] = useState<{keys: string[]; prefixes: string[]} | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const {getRootProps, getInputProps, isDragActive} = useDropzone({
    onDrop: async (acceptedFiles, _fileRejections, event) => {
      if (!onUploadFiles) return;

      // Get files with their full paths from DataTransferItems API
      const filesWithPaths: File[] = [];

      // Type cast event to DragEvent to access dataTransfer
      const dragEvent = event as DragEvent;

      if (dragEvent.dataTransfer?.items) {
        // Use DataTransferItemList API to preserve folder structure
        const items = Array.from(dragEvent.dataTransfer.items);
        await Promise.all(
          items.map(async (item: DataTransferItem) => {
            if (item.kind === 'file') {
              const entry = item.webkitGetAsEntry?.();
              if (entry) {
                await traverseFileTree(entry, '', filesWithPaths);
              }
            }
          }),
        );
      } else {
        // Fallback to standard files
        filesWithPaths.push(...acceptedFiles);
      }

      await onUploadFiles(filesWithPaths.length > 0 ? filesWithPaths : acceptedFiles);
      setShowUploadZone(false);
    },
    noClick: true,
    disabled: !onUploadFiles,
  });

  const selectedCount = selectedFileKeys.size + selectedFolderKeys.size;
  const canSelect = Boolean(onDeleteObject) || transferDestinationBuckets.length > 0 || canMove;

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedFileKeys(new Set());
    setSelectedFolderKeys(new Set());
  }, []);

  useEffect(() => {
    if (!selectionMode) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitSelectionMode();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [exitSelectionMode, selectionMode]);

  const toggleInSet = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  };

  const handleToggleFileSelection = (key: string) => {
    setSelectedFileKeys((prev) => toggleInSet(prev, key));
  };

  const handleToggleFolderSelection = (key: string) => {
    setSelectedFolderKeys((prev) => toggleInSet(prev, key));
  };

  // Open the confirmation dialog for the current multi-selection.
  const handleRequestBulkDelete = () => {
    if (selectedCount === 0) return;
    setPendingDelete({
      keys: Array.from(selectedFileKeys),
      prefixes: Array.from(selectedFolderKeys),
    });
  };

  // Open the confirmation dialog for a single folder (recursive delete).
  const handleDeleteFolder = (folderKey: string) => {
    setPendingDelete({keys: [], prefixes: [folderKey]});
  };

  const handleConfirmBulkDelete = async () => {
    if (!pendingDelete) return;
    setBulkDeleting(true);
    try {
      const job = await objectJobsApi.create({
        operation: 'delete',
        sourceBucket: bucketName,
        objects: pendingDelete.keys,
        prefixes: pendingDelete.prefixes,
      });
      handleJobStarted(job);
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('objects:transfer.startFailed', { operation: t('objects:delete') }));
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleJobStarted = (job: ObjectJob) => {
    setActiveJobId(job.id);
    try {
      localStorage.setItem('garage-ui:active-object-job', job.id);
    } catch {
      // Progress remains available for this page lifetime.
    }
  };

  const handleJobCompleted = useCallback(
    (job: ObjectJob) => {
      try {
        localStorage.removeItem('garage-ui:active-object-job');
      } catch {
        // Ignore unavailable storage.
      }
      if (job.status === 'completed') {
        toast.success(t('objects:job.completed', { operation: t(`objects:${job.operation}`) }));
      } else if (job.status === 'completed_with_errors') {
        toast.error(t('objects:job.completedWithErrors', { operation: t(`objects:${job.operation}`), count: job.failed }));
      } else if (job.status === 'failed') {
        toast.error(job.error || t('objects:job.failedOperation', { operation: t(`objects:${job.operation}`) }));
      }
      setSelectedFileKeys(new Set());
      setSelectedFolderKeys(new Set());
      setSelectionMode(false);
      void onTransferComplete();
    },
    [onTransferComplete, t],
  );

  const handleJobClosed = useCallback(() => {
    try {
      localStorage.removeItem('garage-ui:active-object-job');
    } catch {
      // Ignore unavailable storage.
    }
    setActiveJobId(null);
  }, []);

  const handleDeleteObject = async (key: string): Promise<boolean> => {
    if (!onDeleteObject) return false;
    const success = await onDeleteObject(key);
    if (success) {
      setDeleteObjectDialogOpen(false);
      setSelectedObject(null);
    }
    return success;
  };

  const uploadFiles = async (files: File[]) => {
    if (!onUploadFiles) return;
    await onUploadFiles(files);
    setShowUploadZone(false);
  };

  return (
    <div>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Toolbar */}
        <div
          className={`sticky top-0 z-20 -mx-4 flex min-h-[62px] flex-col flex-wrap items-stretch justify-between gap-3 bg-[var(--background)] px-4 py-3 shadow-sm sm:-mx-6 sm:flex-row sm:items-center sm:px-6 ${selectionMode ? 'border-b-2 border-b-[var(--primary)]' : 'border-b border-b-[var(--border)]'}`}
        >
          {selectionMode ? (
            <>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t('objects:exitSelection')}
                  aria-pressed="true"
                  title={`${t('objects:exitSelection')} (Esc)`}
                  onClick={exitSelectionMode}
                >
                  <X />
                </Button>
                <span className="whitespace-nowrap font-medium">
                  {t('objects:selected', { count: selectedCount })}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {selectedCount > 0 && transferDestinationBuckets.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setJobSelection({
                        operation: 'copy',
                        objects: Array.from(selectedFileKeys),
                        prefixes: Array.from(selectedFolderKeys),
                      })
                    }
                  >
                    <Copy /> {t('objects:copy')}
                  </Button>
                )}
                {selectedCount > 0 && canMove && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setJobSelection({
                        operation: 'move',
                        objects: Array.from(selectedFileKeys),
                        prefixes: Array.from(selectedFolderKeys),
                      })
                    }
                  >
                    <MoveRight /> {t('objects:move')}
                  </Button>
                )}
                {onDeleteObject && selectedCount > 0 && (
                  <Button onClick={handleRequestBulkDelete} variant="destructive">
                    <Trash /> {t('objects:delete')}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex max-w-full flex-1 items-center gap-2 sm:min-w-64 sm:max-w-md">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={deepSearch ? t('objects:deepSearch') : t('objects:searchPrefix')}
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="pl-8"
                  />
                </div>
                <Button
                  type="button"
                  variant={deepSearch ? 'primary' : 'secondary'}
                  onClick={() => onDeepSearchChange(!deepSearch)}
                  aria-pressed={deepSearch}
                  title={
                    deepSearch
                      ? t('objects:deepOnHelp')
                      : t('objects:deepOffHelp')
                  }
                  className="shrink-0"
                >
                  <ScanSearch />
                  <span className="hidden sm:inline">{t('objects:deep')}</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {onUploadFiles && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setShowUploadZone(!showUploadZone)}
                    aria-label={t('common:actions.upload')}
                    title={t('common:actions.upload')}
                  >
                    <Upload />
                  </Button>
                )}
                {onCreateDirectory && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => setCreateDirDialogOpen(true)}
                    aria-label={t('objects:addDirectory')}
                    title={t('objects:addDirectory')}
                  >
                    <FolderPlus />
                  </Button>
                )}
                <div className="ml-1 flex items-center gap-2 border-l border-[var(--border)] pl-3">
                  {canSelect && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={t('common:actions.select')}
                      aria-pressed="false"
                      onClick={() => setSelectionMode(true)}
                      title={t('objects:selectMultiple')}
                    >
                      <ListChecks />
                    </Button>
                  )}
                  <div
                    role="group"
                    aria-label={t('objects:objectView')}
                    className="flex overflow-hidden rounded-md border border-[var(--border)]"
                  >
                    <Button
                      variant={viewMode === 'list' ? 'primary' : 'ghost'}
                      size="icon"
                      className="rounded-none"
                      aria-label={t('objects:listView')}
                      title={t('objects:listView')}
                      aria-pressed={viewMode === 'list'}
                      onClick={() => changeViewMode('list')}
                    >
                      <List />
                    </Button>
                    <Button
                      variant={viewMode === 'grid' ? 'primary' : 'ghost'}
                      size="icon"
                      className="rounded-none"
                      aria-label={t('objects:iconView')}
                      title={t('objects:iconView')}
                      aria-pressed={viewMode === 'grid'}
                      onClick={() => changeViewMode('grid')}
                    >
                      <LayoutGrid />
                    </Button>
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={onRefresh}
                    title={t('common:actions.refresh')}
                    aria-label={t('common:actions.refresh')}
                    disabled={isRefreshing}
                  >
                    <RotateCwIcon
                      className={`transition-transform duration-500 ${isRefreshing ? 'animate-spin' : ''}`}
                    />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Upload Zone */}
        {onUploadFiles && showUploadZone && uploadTasks.length === 0 && (
          <div className="border rounded-lg p-6 bg-muted/30 space-y-4">
            <div className="flex gap-6">
              <div className="flex-shrink-0 flex items-center justify-center">
                <div className="w-20 h-20 bg-primary/10 rounded-lg flex items-center justify-center">
                  <svg
                    className="w-12 h-12 text-primary"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
              </div>

              <div className="flex-1 space-y-3">
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <p className="text-sm">
                    {t('objects:uploadPrompt')}{' '}
                    <label
                      htmlFor="file-input"
                      className="font-medium text-primary hover:underline cursor-pointer"
                    >
                      {t('objects:browseFiles')}
                    </label>
                    {' / '}
                    <label
                      htmlFor="folder-input"
                      className="font-medium text-primary hover:underline cursor-pointer"
                    >
                      {t('objects:browseFolders')}
                    </label>
                  </p>
                  <input
                    id="file-input"
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        const files = Array.from(e.target.files);
                        uploadFiles(files);
                        e.target.value = '';
                      }
                    }}
                    style={{display: 'none'}}
                  />
                  <input
                    id="folder-input"
                    type="file"
                    {...directoryInputAttributes}
                    onChange={(e) => {
                      if (e.target.files) {
                        const files = Array.from(e.target.files);
                        uploadFiles(files);
                        e.target.value = '';
                      }
                    }}
                    style={{display: 'none'}}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Progress */}
        {uploadTasks.length > 0 && <UploadProgress tasks={uploadTasks} />}

        {/* Objects Table with Drag & Drop */}
        <div
          {...getRootProps()}
          className={`relative border rounded-lg transition-all duration-200 overflow-visible ${
            isDragActive ? 'border-primary bg-primary/5 border-2 shadow-lg' : 'border-border'
          }`}
        >
          <input {...getInputProps()} />

          {/* Drag & Drop Overlay */}
          {isDragActive && (
            <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm rounded-lg flex items-center justify-center pointer-events-none">
              <div className="bg-background/95 border-2 border-primary border-dashed rounded-lg p-8 shadow-xl">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative">
                    <Upload className="h-16 w-16 text-primary animate-bounce" />
                    <div className="absolute inset-0 h-16 w-16 text-primary opacity-30 animate-ping">
                      <Upload className="h-16 w-16" />
                    </div>
                  </div>
                  <div className="text-center space-y-2">
                    <p className="text-lg font-semibold text-primary">{t('objects:dropUpload')}</p>
                    <p className="text-sm text-muted-foreground">
                      {t('objects:uploadDestination', { path: currentPath || t('objects:root') })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <ObjectsContent
            viewMode={viewMode}
            bucketName={bucketName}
            publicBaseURL={publicBaseURL}
            canShare={canShare}
            transferDestinationBuckets={transferDestinationBuckets}
            canMove={canMove}
            canRename={canRename}
            objects={objects}
            continuousObjects={continuousObjects}
            currentPath={currentPath}
            searchQuery={searchQuery}
            filterQuery={filterQuery}
            deepSearch={deepSearch}
            selectedFileKeys={selectedFileKeys}
            selectedFolderKeys={selectedFolderKeys}
            selectionMode={selectionMode}
            isDragActive={isDragActive}
            isLoading={isLoading && !isRefreshing && !isNavigating}
            isTruncated={isTruncated}
            nextContinuationToken={nextContinuationToken}
            continuousIsTruncated={continuousIsTruncated}
            isLoadingMore={isLoadingMore}
            loadMoreError={loadMoreError}
            itemsPerPage={itemsPerPage}
            onNavigateToFolder={onNavigateToFolder}
            onDeleteObject={
              onDeleteObject
                ? (obj) => {
                    setSelectedObject(obj);
                    setDeleteObjectDialogOpen(true);
                  }
                : undefined
            }
            onDeleteFolder={onDeleteObject ? (obj) => handleDeleteFolder(obj.key) : undefined}
            onCopyFolder={
              transferDestinationBuckets.length > 0
                ? (obj) =>
                    setJobSelection({
                      operation: 'copy',
                      objects: [],
                      prefixes: [obj.key],
                    })
                : undefined
            }
            onMoveFolder={
              canMove
                ? (obj) =>
                    setJobSelection({
                      operation: 'move',
                      objects: [],
                      prefixes: [obj.key],
                    })
                : undefined
            }
            onToggleFileSelection={handleToggleFileSelection}
            onToggleFolderSelection={handleToggleFolderSelection}
            onEnterSelectionMode={() => setSelectionMode(true)}
            onPageChange={onPageChange}
            onLoadMore={onLoadMore}
            onItemsPerPageChange={onItemsPerPageChange}
            onTransferComplete={onTransferComplete}
            initialPageToken={initialPageToken}
            initialItemsPerPage={initialItemsPerPage}
          />
        </div>
      </div>

      {/* Create Directory Dialog */}
      {onCreateDirectory && (
        <CreateDirectoryDialog
          open={createDirDialogOpen}
          onOpenChange={setCreateDirDialogOpen}
          currentPath={currentPath}
          onCreateDirectory={onCreateDirectory}
        />
      )}

      {/* Delete Object Dialog */}
      <DeleteObjectDialog
        open={deleteObjectDialogOpen}
        onOpenChange={setDeleteObjectDialogOpen}
        object={selectedObject}
        onDeleteObject={handleDeleteObject}
      />

      {/* Bulk / Folder Delete Confirmation */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open && !bulkDeleting) setPendingDelete(null);
        }}
        title={getBulkDeleteTitle(pendingDelete)}
        description={getBulkDeleteDescription(pendingDelete)}
        confirmLabel={t('objects:delete')}
        loading={bulkDeleting}
        onConfirm={handleConfirmBulkDelete}
      />
      {jobSelection && (
        <ObjectJobDialog
          open
          onOpenChange={(open) => {
            if (!open) setJobSelection(null);
          }}
          operation={jobSelection.operation}
          sourceBucket={bucketName}
          objects={jobSelection.objects}
          prefixes={jobSelection.prefixes}
          destinationBuckets={transferDestinationBuckets}
          onStarted={(job) => {
            handleJobStarted(job);
            setJobSelection(null);
          }}
        />
      )}
      <ObjectJobProgressDialog
        jobId={activeJobId}
        onClose={handleJobClosed}
        onCompleted={handleJobCompleted}
      />
    </div>
  );
}

// Builds a concise title summarising what the bulk-delete dialog will remove.
function getBulkDeleteTitle(pending: {keys: string[]; prefixes: string[]} | null): string {
  if (!pending) return i18n.t('objects:deleteItemsTitle');
  const {keys, prefixes} = pending;
  const total = keys.length + prefixes.length;
  if (keys.length === 0 && prefixes.length === 1) {
    return i18n.t('objects:deleteFolderTitle');
  }
  return i18n.t('objects:deleteCountTitle', { count: total });
}

// Spells out the file/folder counts and warns that folders are removed recursively.
function getBulkDeleteDescription(pending: {keys: string[]; prefixes: string[]} | null): string {
  if (!pending) return '';
  const {keys, prefixes} = pending;
  const parts: string[] = [];
  if (keys.length > 0) {
    parts.push(i18n.t('objects:deleteSummaryFiles', { count: keys.length }));
  }
  if (prefixes.length > 0) {
    parts.push(i18n.t('objects:deleteSummaryFolders', { count: prefixes.length }));
  }
  const summary = parts.join(' and ');

  if (prefixes.length > 0) {
    return i18n.t('objects:deleteSummaryRecursive', { summary, count: prefixes.length });
  }
  return i18n.t('objects:deleteSummary', { summary });
}
