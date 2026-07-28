export function normalizeUploadObjectName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error('File name is required.');
  if (name === '.' || name === '..') throw new Error('Choose a different file name.');
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('File names cannot contain path separators.');
  }
  if (/[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('File names cannot contain control characters.');
  }
  return name;
}

export function uploadObjectKey(prefix: string, objectName: string): string {
  const name = normalizeUploadObjectName(objectName);
  if (!prefix) return name;
  return `${prefix.endsWith('/') ? prefix : `${prefix}/`}${name}`;
}

export function keepBothObjectName(fileName: string, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('Sequence must be a positive integer.');
  }
  const dot = fileName.lastIndexOf('.');
  const hasExtension = dot > 0 && dot < fileName.length - 1;
  const stem = hasExtension ? fileName.slice(0, dot) : fileName;
  const extension = hasExtension ? fileName.slice(dot) : '';
  return `${stem} (${sequence})${extension}`;
}
