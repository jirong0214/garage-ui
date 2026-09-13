import type {MouseEvent, ReactNode} from 'react';
import {Button, buttonVariants} from '@/components/ui/button';
import {Table, TableBody, TableCell, TableHead, TableHeader, TableRow} from '@/components/ui/table';
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger} from '@/components/ui/tooltip';
import {DropdownMenu, DropdownMenuContent, DropdownMenuTrigger} from '@/components/ui/dropdown-menu';
import {Copy, Download, Link2, Loader2, MoreVertical} from 'lucide-react';
import {downloadObject, formatBytes, formatObjectModifiedTime} from '@/lib/file-utils';
import type {S3Object} from '@/types';
import type {ObjectsContentProps} from './ObjectsContent';
import {ObjectThumbnail} from './ObjectThumbnail';

interface Props extends Pick<
  ObjectsContentProps,
  | 'bucketName'
  | 'currentPath'
  | 'selectedFileKeys'
  | 'selectedFolderKeys'
  | 'searchQuery'
  | 'isDragActive'
  | 'publicBaseURL'
  | 'canShare'
  | 'canRename'
  | 'transferDestinationBuckets'
  | 'canMove'
  | 'onDeleteObject'
> {
  pageObjects: S3Object[];
  canSelect: boolean;
  sortColumn: 'name' | 'size' | 'modified';
  sortDirection: 'asc' | 'desc';
  handleSort: (column: 'name' | 'size' | 'modified') => void;
  isLoading: boolean;
  copyPublicURL: (key: string) => Promise<void>;
  renderMutationItems: (object: S3Object) => ReactNode;
  onActivate: (object: S3Object, event: MouseEvent<HTMLElement>) => void;
  onShare: (object: S3Object) => void;
}

export function ObjectsTable({
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
  publicBaseURL,
  canShare,
  canRename,
  transferDestinationBuckets = [],
  canMove,
  onDeleteObject,
  copyPublicURL,
  renderMutationItems,
  onActivate,
  onShare,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <TooltipProvider>
        <Table className="table-fixed min-w-[970px] sm:min-w-[1100px]">
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[300px] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('name')}
              >
                Objects {sortColumn === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="hidden w-[130px] sm:table-cell">Type</TableHead>
              <TableHead
                className="w-[90px] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('size')}
              >
                Size {sortColumn === 'size' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead
                className="w-[160px] cursor-pointer hover:bg-muted/50"
                onClick={() => handleSort('modified')}
              >
                Modified {sortColumn === 'modified' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="w-[360px]">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading objects...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : pageObjects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                  {searchQuery
                    ? 'No objects found matching your search'
                    : isDragActive
                      ? 'Drop files or folders here'
                      : 'No objects in this location'}
                </TableCell>
              </TableRow>
            ) : (
              pageObjects.map((obj) => {
                const selected = obj.isFolder
                  ? selectedFolderKeys.has(obj.key)
                  : selectedFileKeys.has(obj.key);
                return (
                <TableRow
                  key={obj.key}
                  aria-selected={selected}
                  onClick={(event) => onActivate(obj, event)}
                  className={`cursor-pointer ${selected ? 'bg-[var(--accent-primary-soft)] ring-1 ring-inset ring-[var(--primary)]' : ''}`}
                >
                  <TableCell className="w-[300px]">
                    <div className="flex min-w-0 items-center gap-2">
                      <ObjectThumbnail bucketName={bucketName} object={obj} />
                      {obj.isFolder ? (
                        <button
                          title={`${obj.key.replace(currentPath, '').replace(/\/$/, '')}${canSelect ? ' · Cmd/Ctrl-click to select' : ''}`}
                          className="line-clamp-2 min-w-0 flex-1 cursor-pointer break-all text-left font-medium underline hover:text-primary"
                        >
                          {obj.key.replace(currentPath, '').replace(/\/$/, '')}
                        </button>
                      ) : (
                        <button
                          title={`${obj.key.replace(currentPath, '')}${canSelect ? ' · Cmd/Ctrl-click to select' : ''}`}
                          className="line-clamp-2 min-w-0 flex-1 cursor-pointer break-all text-left font-medium hover:text-primary hover:underline"
                        >
                          {obj.key.replace(currentPath, '')}
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden w-[130px] sm:table-cell">
                    <span
                      className="line-clamp-2 break-all text-muted-foreground"
                      title={obj.isFolder ? 'Directory' : obj.contentType || 'application/octet-stream'}
                    >
                      {obj.isFolder ? 'Directory' : obj.contentType || 'application/octet-stream'}
                    </span>
                  </TableCell>
                  <TableCell className="w-[90px]">{obj.isFolder ? null : formatBytes(obj.size)}</TableCell>
                  <TableCell className="w-[160px]">
                    {obj.lastModified
                      ? (() => {
                          const d = new Date(obj.lastModified);
                          return <span className="text-muted-foreground">{formatObjectModifiedTime(d)}</span>;
                        })()
                      : null}
                  </TableCell>
                  <TableCell className="w-[360px]" onClick={(event) => event.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      {!obj.isFolder && publicBaseURL && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="px-2 text-[13px]"
                              onClick={() => copyPublicURL(obj.key)}
                              aria-label={`Copy public URL for ${obj.key}`}
                            >
                              <Copy className="h-4 w-4" />
                              Public URL
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Copy public URL</TooltipContent>
                        </Tooltip>
                      )}
                      {!obj.isFolder && canShare && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="px-2 text-[13px]"
                              onClick={() => onShare(obj)}
                              aria-label={`Create signed URL for ${obj.key}`}
                            >
                              <Link2 className="h-4 w-4" />
                              Share
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Create signed URL</TooltipContent>
                        </Tooltip>
                      )}
                      {!obj.isFolder && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="px-2 text-[13px]"
                              onClick={() => downloadObject(bucketName, obj.key)}
                              aria-label={`Download ${obj.key}`}
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Download</TooltipContent>
                        </Tooltip>
                      )}
                      {obj.isFolder ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${obj.key}`}
                            className={buttonVariants({variant: 'ghost', size: 'icon-sm'})}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">{renderMutationItems(obj)}</DropdownMenuContent>
                        </DropdownMenu>
                      ) : canRename || transferDestinationBuckets.length > 0 || canMove || onDeleteObject ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Actions for ${obj.key}`}
                            className={buttonVariants({variant: 'ghost', size: 'icon-sm'})}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">{renderMutationItems(obj)}</DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  );
}
