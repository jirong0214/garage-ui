import type {S3Object} from '@/types';

export type ObjectFileKind =
  | 'folder'
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'code'
  | 'json'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'archive'
  | 'font'
  | 'key'
  | 'binary'
  | 'unknown';

const jsonTypes = new Set([
  'application/json',
  'application/geo+json',
  'application/json-seq',
  'application/ld+json',
  'application/x-ndjson',
]);

const codeTypes = new Set([
  'application/ecmascript',
  'application/graphql',
  'application/javascript',
  'application/sql',
  'application/wasm',
  'application/x-csh',
  'application/x-httpd-php',
  'application/x-javascript',
  'application/x-sh',
  'application/x-yaml',
  'text/css',
  'text/ecmascript',
  'text/html',
  'text/javascript',
  'text/jsx',
  'text/typescript',
  'text/tsx',
  'text/x-c',
  'text/x-c++',
  'text/x-go',
  'text/x-java-source',
  'text/x-python',
  'text/x-rust',
  'text/x-shellscript',
  'text/yaml',
]);

const documentTypes = new Set([
  'application/epub+zip',
  'application/msword',
  'application/pdf',
  'application/rtf',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  'text/rtf',
]);

const spreadsheetTypes = new Set([
  'application/vnd.ms-excel',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  'text/csv',
  'text/tab-separated-values',
]);

const presentationTypes = new Set([
  'application/vnd.apple.keynote',
  'application/vnd.ms-powerpoint',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
]);

const archiveTypes = new Set([
  'application/gzip',
  'application/java-archive',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-bzip',
  'application/x-bzip2',
  'application/x-compress',
  'application/x-gzip',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/x-xz',
  'application/zip',
  'application/zstd',
]);

const keyTypes = new Set([
  'application/pkcs10',
  'application/pkcs12',
  'application/pkcs7-mime',
  'application/pkix-cert',
  'application/x-pem-file',
  'application/x-pkcs12',
]);

const binaryTypes = new Set([
  'application/octet-stream',
  'application/vnd.android.package-archive',
  'application/x-apple-diskimage',
  'application/x-deb',
  'application/x-dosexec',
  'application/x-executable',
  'application/x-iso9660-image',
  'application/x-mach-binary',
  'application/x-msdownload',
  'application/x-rpm',
]);

const extensionKinds: Record<string, ObjectFileKind> = {
  // Images, including formats that do not currently have thumbnail support.
  avif: 'image', bmp: 'image', gif: 'image', heic: 'image', heif: 'image',
  ico: 'image', jpeg: 'image', jpg: 'image', png: 'image', svg: 'image',
  tif: 'image', tiff: 'image', webp: 'image',

  avi: 'video', m4v: 'video', mkv: 'video', mov: 'video', mp4: 'video',
  mpeg: 'video', mpg: 'video', ogv: 'video', webm: 'video', wmv: 'video',

  aac: 'audio', flac: 'audio', m4a: 'audio', mp3: 'audio', oga: 'audio',
  ogg: 'audio', opus: 'audio', wav: 'audio', wma: 'audio',

  conf: 'text', ini: 'text', log: 'text', markdown: 'text', md: 'text',
  nfo: 'text', txt: 'text',

  c: 'code', cc: 'code', cpp: 'code', cs: 'code', css: 'code', go: 'code',
  graphql: 'code', h: 'code', hpp: 'code', html: 'code', java: 'code',
  js: 'code', jsx: 'code', kt: 'code', lua: 'code', php: 'code', py: 'code',
  rb: 'code', rs: 'code', sh: 'code', sql: 'code', swift: 'code', toml: 'code',
  ts: 'code', tsx: 'code', vue: 'code', wasm: 'code', xml: 'code',
  yaml: 'code', yml: 'code',

  geojson: 'json', json: 'json', jsonl: 'json', ndjson: 'json',

  doc: 'document', docx: 'document', epub: 'document', odt: 'document',
  pdf: 'document', rtf: 'document',

  csv: 'spreadsheet', ods: 'spreadsheet', tsv: 'spreadsheet',
  xls: 'spreadsheet', xlsx: 'spreadsheet',

  key: 'presentation', keynote: 'presentation', odp: 'presentation',
  pps: 'presentation', ppsx: 'presentation', ppt: 'presentation',
  pptx: 'presentation',

  '7z': 'archive', bz: 'archive', bz2: 'archive', gz: 'archive',
  jar: 'archive', rar: 'archive', tar: 'archive', tbz: 'archive',
  tbz2: 'archive', tgz: 'archive', txz: 'archive', war: 'archive',
  xz: 'archive', zip: 'archive', zst: 'archive',

  otf: 'font', ttf: 'font', woff: 'font', woff2: 'font',

  asc: 'key', cer: 'key', crt: 'key', der: 'key', p12: 'key',
  pem: 'key', pfx: 'key', pub: 'key',

  apk: 'binary', bin: 'binary', deb: 'binary', dmg: 'binary', exe: 'binary',
  img: 'binary', iso: 'binary', msi: 'binary', pkg: 'binary', rpm: 'binary',
};

const specialFileNames: Record<string, ObjectFileKind> = {
  dockerfile: 'code',
  gemfile: 'code',
  makefile: 'code',
  procfile: 'code',
  rakefile: 'code',
};

export const objectFileKindLabels: Record<ObjectFileKind, string> = {
  folder: 'Folder',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  text: 'Text file',
  code: 'Code file',
  json: 'JSON file',
  document: 'Document',
  spreadsheet: 'Spreadsheet',
  presentation: 'Presentation',
  archive: 'Archive',
  font: 'Font',
  key: 'Key or certificate',
  binary: 'Binary file',
  unknown: 'File',
};

export function normalizeContentType(contentType?: string): string {
  return contentType?.split(';', 1)[0].trim().toLowerCase() ?? '';
}

function kindFromContentType(contentType: string): ObjectFileKind | undefined {
  if (!contentType) return undefined;
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.startsWith('font/') || contentType.startsWith('application/font-')) return 'font';
  if (jsonTypes.has(contentType) || contentType.endsWith('+json')) return 'json';
  if (
    codeTypes.has(contentType) ||
    contentType === 'application/xml' ||
    contentType === 'text/xml' ||
    contentType.endsWith('+xml')
  ) return 'code';
  if (spreadsheetTypes.has(contentType)) return 'spreadsheet';
  if (presentationTypes.has(contentType)) return 'presentation';
  if (documentTypes.has(contentType)) return 'document';
  if (archiveTypes.has(contentType)) return 'archive';
  if (keyTypes.has(contentType)) return 'key';
  if (contentType.startsWith('text/')) return 'text';
  if (binaryTypes.has(contentType)) return 'binary';
  return undefined;
}

function kindFromKey(key: string): ObjectFileKind | undefined {
  const fileName = key.split('/').pop()?.toLowerCase() ?? '';
  if (specialFileNames[fileName]) return specialFileNames[fileName];
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return undefined;
  return extensionKinds[fileName.slice(dot + 1)];
}

export function getObjectFileKind(object: Pick<S3Object, 'key' | 'contentType' | 'isFolder'>): ObjectFileKind {
  if (object.isFolder) return 'folder';
  const contentType = normalizeContentType(object.contentType);
  const mimeKind = kindFromContentType(contentType);

  // Generic binary metadata is common for S3 uploads, so a useful extension
  // should take precedence over the uninformative octet-stream classification.
  if (mimeKind && mimeKind !== 'binary') return mimeKind;
  return kindFromKey(object.key) ?? mimeKind ?? 'unknown';
}
