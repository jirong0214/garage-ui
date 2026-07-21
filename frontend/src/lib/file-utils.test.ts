import {describe, expect, it} from 'vitest';
import {formatLocalDateTime, formatObjectModifiedTime, formatUTCDateTime} from './file-utils';

describe('object timestamps', () => {
  it('formats local and UTC values as yyyy-MM-dd HH:mm:ss', () => {
    const localDate = new Date(2026, 6, 21, 14, 5, 9);
    const utcDate = new Date(Date.UTC(2026, 6, 21, 14, 5, 9));

    expect(formatLocalDateTime(localDate)).toBe('2026-07-21 14:05:09');
    expect(formatUTCDateTime(utcDate)).toBe('2026-07-21 14:05:09 UTC');
  });

  it('uses relative time only for objects modified within seven days', () => {
    const now = new Date(2026, 6, 21, 14, 0, 0);
    const recent = new Date(2026, 6, 19, 14, 0, 0);
    const older = new Date(2026, 6, 10, 8, 30, 15);

    expect(formatObjectModifiedTime(recent, now)).toBe('2 days ago');
    expect(formatObjectModifiedTime(older, now)).toBe('2026-07-10 08:30:15');
  });
});
