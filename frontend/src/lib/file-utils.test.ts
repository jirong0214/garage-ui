import {afterAll, beforeEach, describe, expect, it} from 'vitest';
import {formatLocalDateTime, formatObjectModifiedTime, formatUTCDateTime} from './file-utils';
import i18n from '@/i18n';

describe('object timestamps', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  afterAll(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('formats local and UTC values for the active locale', () => {
    const localDate = new Date(2026, 6, 21, 14, 5, 9);
    const utcDate = new Date(Date.UTC(2026, 6, 21, 14, 5, 9));

    expect(formatLocalDateTime(localDate)).toBe('07/21/2026, 02:05:09 PM');
    expect(formatUTCDateTime(utcDate)).toBe('07/21/2026, 02:05:09 PM UTC');
  });

  it('uses relative time only for objects modified within seven days', () => {
    const now = new Date(2026, 6, 21, 14, 0, 0);
    const recent = new Date(2026, 6, 19, 14, 0, 0);
    const older = new Date(2026, 6, 10, 8, 30, 15);

    expect(formatObjectModifiedTime(recent, now)).toBe('2 days ago');
    expect(formatObjectModifiedTime(older, now)).toBe('07/10/2026, 08:30:15 AM');
  });

  it('switches dates and relative times to Simplified Chinese', async () => {
    await i18n.changeLanguage('zh-CN');
    const date = new Date(2026, 6, 21, 14, 5, 9);
    expect(formatLocalDateTime(date)).toBe('2026/07/21 14:05:09');
    expect(formatObjectModifiedTime(new Date(2026, 6, 19, 14, 5, 9), date)).toBe('2 天前');
  });
});
