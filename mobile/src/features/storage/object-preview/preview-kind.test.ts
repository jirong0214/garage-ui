import { describe, expect, it } from 'vitest';

import { previewKind } from './preview-kind';

describe('previewKind', () => {
  it.each([
    ['image/jpeg', 'photo.bin', 'image'],
    ['application/octet-stream', 'photo.heic', 'image'],
    ['video/mp4', 'clip', 'video'],
    ['application/octet-stream', 'track.m4a', 'audio'],
    ['application/pdf', 'document', 'pdf'],
    ['application/json; charset=utf-8', 'data', 'text'],
    ['application/octet-stream', 'main.swift', 'text'],
  ])('classifies %s / %s as %s', (mime, key, expected) => {
    expect(previewKind(mime, key)).toBe(expected);
  });

  it.each([
    ['image/svg+xml', 'image.svg'],
    ['text/html', 'page.html'],
    ['application/octet-stream', 'archive.zip'],
  ])('keeps active or unknown content in the safe fallback: %s', (mime, key) => {
    expect(previewKind(mime, key)).toBe('unsupported');
  });
});
