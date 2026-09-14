import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { common as enCommon } from './locales/en-US/common';
import { auth as enAuth } from './locales/en-US/auth';
import { dashboard as enDashboard } from './locales/en-US/dashboard';
import { buckets as enBuckets } from './locales/en-US/buckets';
import { objects as enObjects } from './locales/en-US/objects';
import { access as enAccess } from './locales/en-US/access';
import { cluster as enCluster } from './locales/en-US/cluster';
import { common as zhCommon } from './locales/zh-CN/common';
import { auth as zhAuth } from './locales/zh-CN/auth';
import { dashboard as zhDashboard } from './locales/zh-CN/dashboard';
import { buckets as zhBuckets } from './locales/zh-CN/buckets';
import { objects as zhObjects } from './locales/zh-CN/objects';
import { access as zhAccess } from './locales/zh-CN/access';
import { cluster as zhCluster } from './locales/zh-CN/cluster';

export const supportedLanguages = ['en-US', 'zh-CN'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];
export const languageStorageKey = 'garage-ui-language';

export const resources = {
  'en-US': { common: enCommon, auth: enAuth, dashboard: enDashboard, buckets: enBuckets, objects: enObjects, access: enAccess, cluster: enCluster },
  'zh-CN': { common: zhCommon, auth: zhAuth, dashboard: zhDashboard, buckets: zhBuckets, objects: zhObjects, access: zhAccess, cluster: zhCluster },
} as const;

export function normalizeLanguage(value?: string | null): SupportedLanguage | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en-US';
  return null;
}

function detectLanguage(): SupportedLanguage {
  try {
    const saved = normalizeLanguage(localStorage.getItem(languageStorageKey));
    if (saved) return saved;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  for (const language of navigator.languages ?? [navigator.language]) {
    const supported = normalizeLanguage(language);
    if (supported) return supported;
  }
  return 'en-US';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en-US',
  defaultNS: 'common',
  supportedLngs: supportedLanguages,
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

function syncDocumentLanguage(language: string) {
  const normalized = normalizeLanguage(language) ?? 'en-US';
  document.documentElement.lang = normalized;
  document.documentElement.dir = 'ltr';
  try {
    localStorage.setItem(languageStorageKey, normalized);
  } catch {
    // The active language still works for this session when storage is unavailable.
  }
}

syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language);
i18n.on('languageChanged', syncDocumentLanguage);

export function currentLocale(): SupportedLanguage {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en-US';
}

export default i18n;
