import { CheckCircle, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { UploadTask } from '@/types';
import { useTranslation } from 'react-i18next';

interface UploadProgressProps {
  tasks: UploadTask[];
}

export function UploadProgress({ tasks }: UploadProgressProps) {
  const { t } = useTranslation('objects');
  if (tasks.length === 0) return null;

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;
  const totalCount = tasks.length;
  const processedCount = completedCount + errorCount;
  const allDone = processedCount === totalCount;

  // Find currently uploading file
  const currentFile = tasks.find(t => t.status === 'uploading');
  const currentFileName = currentFile?.key.split('/').pop() || currentFile?.key || t('upload.processing');

  // File-based progress plus contribution from current upload
  const baseProgress = (processedCount / totalCount) * 100;
  const currentFileContribution = currentFile
    ? (currentFile.progress / 100) * (1 / totalCount) * 100
    : 0;
  const overallProgress = Math.min(baseProgress + currentFileContribution, 100);

  return (
    <Card className="border-primary/20 shadow-md">
      <CardContent className="pt-6">
        <div className="space-y-4">
          {/* Header with icon and status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg flex-shrink-0 ${
                allDone
                  ? 'bg-green-500/10 dark:bg-green-500/20'
                  : errorCount > 0
                    ? 'bg-yellow-500/10 dark:bg-yellow-500/20'
                    : 'bg-primary/10 dark:bg-primary/20'
              }`}>
                {allDone ? (
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-500" />
                ) : errorCount > 0 ? (
                  <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
                ) : (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm">
                  {allDone ? t('upload.complete') : t('upload.uploading')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {t('upload.progress', { completed: processedCount, total: totalCount })}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className={`text-2xl font-bold tabular-nums ${
                allDone ? 'text-green-600 dark:text-green-500' : 'text-primary'
              }`}>
                {Math.round(overallProgress)}%
              </div>
            </div>
          </div>

          {/* Progress bar with gradient */}
          <div className="space-y-2">
            {!allDone && currentFile && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Upload className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate flex-1" title={currentFileName}>
                  {currentFileName}
                </span>
              </div>
            )}
            <div className="relative w-full bg-secondary rounded-full h-3 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ease-out relative bg-green-500 dark:bg-green-600`}
                style={{ width: `${overallProgress}%` }}
              >
                {/* Animated shimmer effect */}
                {!allDone && overallProgress > 0 && (
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 dark:via-white/25 to-transparent animate-shimmer"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Error indicator with icon */}
          {errorCount > 0 && (
            <div className="flex items-center gap-2 text-xs bg-red-500/10 dark:bg-red-500/20 text-red-700 dark:text-red-400 rounded-md px-3 py-2 border border-red-200 dark:border-red-900/50">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>
                {t('upload.failedCount', { count: errorCount })}
              </span>
            </div>
          )}

          {/* Success message */}
          {allDone && errorCount === 0 && (
            <div className="flex items-center gap-2 text-xs bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-400 rounded-md px-3 py-2 border border-green-200 dark:border-green-900/50">
              <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{t('upload.allSucceeded')}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
