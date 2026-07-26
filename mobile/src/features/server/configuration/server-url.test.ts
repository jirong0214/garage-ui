import { describe, expect, it } from 'vitest';

import { normalizeServerUrl, ServerUrlError } from './server-url';

describe('normalizeServerUrl', () => {
  it('adds HTTPS and removes a trailing slash', () => {
    expect(normalizeServerUrl(' garage.example.com/ ')).toBe('https://garage.example.com');
  });

  it('preserves an explicit port', () => {
    expect(normalizeServerUrl('https://garage.example.com:3909')).toBe('https://garage.example.com:3909');
  });

  it('allows HTTP only with the explicit Debug override', () => {
    expect(normalizeServerUrl('http://192.168.1.10:3910', true)).toBe('http://192.168.1.10:3910');
    expect(() => normalizeServerUrl('http://192.168.1.10:3910', false)).toThrow(ServerUrlError);
    expect(() => normalizeServerUrl('http://example.com', true)).toThrow(ServerUrlError);
  });

  it.each([
    'https://user:secret@example.com',
    'https://example.com/api/v1',
    'https://example.com?token=secret',
    'https://example.com/#fragment',
  ])('rejects unsafe or non-origin input: %s', (input) => {
    expect(() => normalizeServerUrl(input)).toThrow(ServerUrlError);
  });
});
