import {Button} from '@/components/ui/button';
import {Select, SelectOption} from '@/components/ui/select';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import { useTranslation } from 'react-i18next';
interface Props {
  totalItems: number;
  visibleItems: number;
  hasPrevious: boolean;
  hasNext: boolean;
  itemsPerPage: number;
  isDeepSearching: boolean;
  pageIndex: number;
  totalPages: number;
  isTruncated: boolean;
  handleItemsPerPageChange: (value: string) => void;
  handlePreviousPage: () => void;
  handleNextPage: () => void;
}
export function ObjectsPagination({
  totalItems,
  visibleItems,
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
}: Props) {
  const { t } = useTranslation('objects');
  return (
    <>
      {/* Pagination Controls */}
      {(totalItems > 0 || hasPrevious) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-4 py-4 border-t bg-background">
          {/* Items per page selector */}
          <div className="flex items-center gap-2 text-sm relative z-10">
            <span className="text-muted-foreground">{t('pagination.perPage')}</span>
            <Select value={itemsPerPage.toString()} onChange={handleItemsPerPageChange}>
              <SelectOption value="10">10</SelectOption>
              <SelectOption value="25">25</SelectOption>
              <SelectOption value="50">50</SelectOption>
              <SelectOption value="100">100</SelectOption>
              <SelectOption value="200">200</SelectOption>
            </Select>
          </div>

          {/* Pagination info and controls */}
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4">
            <span className="text-sm text-muted-foreground">
              {isDeepSearching
                ? `${t('pagination.page', { page: pageIndex + 1, total: totalPages })} • ${t('pagination.matches', { count: totalItems })}${isTruncated ? ` (${t('pagination.capped')})` : ''}`
                : `${t('pagination.current', { page: pageIndex + 1 })} • ${t('pagination.showing', { count: visibleItems })}`}
            </span>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handlePreviousPage}
                disabled={!hasPrevious}
                className="h-8"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('pagination.previous')}
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNext}
                className="h-8"
              >
                {t('pagination.next')}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
