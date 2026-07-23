import {describe, expect, it} from 'vitest';
import {getObjectFileKind, normalizeContentType} from './object-file-type';

describe('object file type classification', () => {
  it('normalizes MIME parameters and casing', () => {
    expect(normalizeContentType(' Application/JSON; Charset=UTF-8 ')).toBe('application/json');
  });

  it.each([
    ['photo.heic', 'image/heic', 'image'],
    ['movie.bin', 'video/mp4', 'video'],
    ['track.dat', 'audio/flac', 'audio'],
    ['readme', 'text/plain; charset=utf-8', 'text'],
    ['schema.dat', 'application/ld+json', 'json'],
    ['feed.dat', 'application/atom+xml', 'code'],
    ['report.dat', 'application/pdf', 'document'],
    ['budget.dat', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'spreadsheet'],
    ['slides.dat', 'application/vnd.ms-powerpoint', 'presentation'],
    ['backup.dat', 'application/zstd', 'archive'],
    ['site.dat', 'font/woff2', 'font'],
    ['identity.dat', 'application/pkix-cert', 'key'],
    ['installer.dat', 'application/x-apple-diskimage', 'binary'],
  ])('classifies %s from %s as %s', (key, contentType, expected) => {
    expect(getObjectFileKind({key, contentType})).toBe(expected);
  });

  it.each([
    ['photo.avif', 'image'],
    ['movie.mkv', 'video'],
    ['track.opus', 'audio'],
    ['app.tsx', 'code'],
    ['events.jsonl', 'json'],
    ['report.docx', 'document'],
    ['budget.ods', 'spreadsheet'],
    ['slides.key', 'presentation'],
    ['backup.tar.gz', 'archive'],
    ['font.woff2', 'font'],
    ['certificate.pem', 'key'],
    ['installer.dmg', 'binary'],
    ['Dockerfile', 'code'],
  ])('falls back to the extension for %s', (key, expected) => {
    expect(getObjectFileKind({key, contentType: 'application/octet-stream'})).toBe(expected);
  });

  it('prefers a meaningful MIME type over a conflicting extension', () => {
    expect(getObjectFileKind({key: 'not-really-a-video.mp4', contentType: 'application/pdf'}))
      .toBe('document');
  });

  it('handles folders and unknown objects', () => {
    expect(getObjectFileKind({key: 'albums/', isFolder: true})).toBe('folder');
    expect(getObjectFileKind({key: 'README', contentType: 'application/x-custom'})).toBe('unknown');
  });
});
