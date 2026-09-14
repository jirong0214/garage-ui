import { objectsApi } from './api';
import { toast } from 'sonner';
import i18n, { currentLocale } from '@/i18n';

/**
 * Download an object from a bucket by fetching it as a blob and clicking a
 * temporary anchor element. Errors are surfaced by the axios interceptor.
 */
export async function downloadObject(bucket: string, key: string): Promise<void> {
  try {
    const blob = await objectsApi.get(bucket, key);
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = key.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success(i18n.t('objects:downloadStarted', { defaultValue: 'Download started' }));
  } catch {
    // error toast handled by axios interceptor
  }
}

/**
 * Get the file type based on file extension
 */
export function getFileType(filename: string): string {
  if (!filename) return i18n.t('fileTypes.unknown');

  const extension = filename.split('.').pop()?.toLowerCase() || '';
  if (!extension) return i18n.t('fileTypes.file');

  const typeMap: Record<string, string> = {
    // Images
    'png': i18n.t('fileTypes.image'),
    'jpg': i18n.t('fileTypes.image'),
    'jpeg': i18n.t('fileTypes.image'),
    'gif': i18n.t('fileTypes.image'),
    'svg': i18n.t('fileTypes.image'),
    'webp': i18n.t('fileTypes.image'),

    // Documents
    'pdf': 'PDF',
    'doc': i18n.t('fileTypes.document'),
    'docx': i18n.t('fileTypes.document'),
    'xls': i18n.t('fileTypes.spreadsheet'),
    'xlsx': i18n.t('fileTypes.spreadsheet'),
    'ppt': i18n.t('fileTypes.presentation'),
    'pptx': i18n.t('fileTypes.presentation'),
    'txt': i18n.t('fileTypes.text'),

    // Archives
    'zip': i18n.t('fileTypes.archive'),
    'rar': i18n.t('fileTypes.archive'),
    'gz': i18n.t('fileTypes.archive'),
    'tar': i18n.t('fileTypes.archive'),

    // Video/Audio
    'mp4': i18n.t('fileTypes.video'),
    'avi': i18n.t('fileTypes.video'),
    'mov': i18n.t('fileTypes.video'),
    'mkv': i18n.t('fileTypes.video'),
    'webm': i18n.t('fileTypes.video'),
    'mp3': i18n.t('fileTypes.audio'),
    'wav': i18n.t('fileTypes.audio'),
    'flac': i18n.t('fileTypes.audio'),

    // Code
    'js': 'JavaScript',
    'ts': 'TypeScript',
    'tsx': 'TypeScript',
    'jsx': 'JavaScript',
    'py': 'Python',
    'java': 'Java',
    'cpp': 'C++',
    'c': 'C',
    'html': 'HTML',
    'css': 'CSS',
    'json': 'JSON',
    'xml': 'XML',
    'sql': 'SQL',

    // Data
    'csv': 'CSV',
  };

  return typeMap[extension] || extension.toUpperCase();
}

/**
 * Format relative time from a date
 */
export function formatRelativeTime(date: Date, now = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return i18n.t('time.justNow');
  if (diffMins < 60) return i18n.t('time.minuteAgo', { count: diffMins });
  if (diffHours < 24) return i18n.t('time.hourAgo', { count: diffHours });
  if (diffDays < 7) return i18n.t('time.dayAgo', { count: diffDays });
  if (diffDays < 30) return i18n.t('time.weekAgo', { count: Math.floor(diffDays / 7) });
  return i18n.t('time.monthAgo', { count: Math.floor(diffDays / 30) });
}

export function formatLocalDateTime(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(date);
}

export function formatUTCDateTime(date: Date): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  }).format(date);
}

export function formatObjectModifiedTime(date: Date, now = new Date()): string {
  const age = now.getTime() - date.getTime();
  if (age >= 0 && age < 7 * 24 * 60 * 60 * 1000) {
    return formatRelativeTime(date, now);
  }
  return formatLocalDateTime(date);
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return `0 ${i18n.t('units.bytes')}`;

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = [i18n.t('units.bytes'), 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${new Intl.NumberFormat(currentLocale(), { maximumFractionDigits: dm }).format(bytes / Math.pow(k, i))} ${sizes[i]}`;
}
