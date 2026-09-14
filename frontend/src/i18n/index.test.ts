import { afterAll, describe, expect, it } from 'vitest';
import i18n, {
  languageStorageKey,
  normalizeLanguage,
  resources,
  supportedLanguages,
} from './index';

function leafPaths(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('i18n resources', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('keeps every locale and namespace structurally in sync', () => {
    const reference = resources['en-US'];
    for (const language of supportedLanguages) {
      expect(Object.keys(resources[language]).sort()).toEqual(Object.keys(reference).sort());
      for (const namespace of Object.keys(reference) as Array<keyof typeof reference>) {
        expect(leafPaths(resources[language][namespace]).sort()).toEqual(
          leafPaths(reference[namespace]).sort(),
        );
      }
    }
  });

  it.each([
    ['zh', 'zh-CN'],
    ['zh-Hans-CN', 'zh-CN'],
    ['en', 'en-US'],
    ['en-GB', 'en-US'],
    ['fr-FR', null],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeLanguage(input)).toBe(expected);
  });

  it('persists language changes and updates the document language', async () => {
    await i18n.changeLanguage('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(localStorage.getItem(languageStorageKey)).toBe('zh-CN');
    expect(i18n.t('common:actions.save')).toBe('保存');
  });
});
