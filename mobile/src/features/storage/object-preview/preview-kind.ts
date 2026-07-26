export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'unsupported';

const imageExtensions = new Set(['avif', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
const videoExtensions = new Set(['m4v', 'mov', 'mp4', 'webm']);
const audioExtensions = new Set(['aac', 'flac', 'm4a', 'mp3', 'ogg', 'wav']);
const textExtensions = new Set([
  'c', 'conf', 'cpp', 'css', 'csv', 'go', 'h', 'html', 'ini', 'java', 'js', 'json',
  'jsx', 'kt', 'log', 'md', 'mjs', 'py', 'rb', 'rs', 'sh', 'sql', 'swift', 'toml',
  'ts', 'tsx', 'txt', 'xml', 'yaml', 'yml',
]);

export function previewKind(contentType: string | undefined, key: string): PreviewKind {
  const mime = contentType?.split(';')[0].trim().toLowerCase() ?? '';
  const extension = key.split('.').at(-1)?.toLowerCase() ?? '';

  if (mime === 'image/svg+xml' || mime === 'text/html') return 'unsupported';
  if (mime.startsWith('image/') || imageExtensions.has(extension)) return 'image';
  if (mime.startsWith('video/') || videoExtensions.has(extension)) return 'video';
  if (mime.startsWith('audio/') || audioExtensions.has(extension)) return 'audio';
  if (mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime.endsWith('+json') ||
    mime.endsWith('+xml') ||
    textExtensions.has(extension)
  ) {
    return 'text';
  }
  return 'unsupported';
}
