import { describe, expect, it } from 'vitest';

import { ApiCompatibilityError, assertCompatibleApiVersion } from './api-version';

describe('assertCompatibleApiVersion', () => {
  it.each(['1.0.0', '1.9.3'])('accepts the initial compatible major: %s', (version) => {
    expect(() => assertCompatibleApiVersion(version, false)).not.toThrow();
  });

  it('allows a missing version only for an explicit Debug diagnostic build', () => {
    expect(() => assertCompatibleApiVersion(undefined, true)).not.toThrow();
    expect(() => assertCompatibleApiVersion(undefined, false)).toThrow(ApiCompatibilityError);
  });

  it.each(['2.0.0', 'invalid'])('rejects unsupported contracts even in Debug: %s', (version) => {
    expect(() => assertCompatibleApiVersion(version, true)).toThrow(ApiCompatibilityError);
  });
});
