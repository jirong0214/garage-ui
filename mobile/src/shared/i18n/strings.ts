import { getLocales } from 'expo-localization';

const translations = {
  en: {
    addServer: 'Connect to Garage UI',
    serverHint: 'Enter the address of your Garage UI service.',
    serverUrl: 'Server URL',
    testConnection: 'Test connection',
    testing: 'Testing…',
    compatible: 'Connection successful',
    legacyApi: 'Connected, but this server does not report an API version. Debug use is allowed.',
    login: 'Sign in',
    username: 'Username',
    password: 'Password',
    signingIn: 'Signing in…',
    buckets: 'Buckets',
    files: 'Files',
    transfers: 'Transfers',
    settings: 'Settings',
    noBuckets: 'No buckets available',
    noObjects: 'This folder is empty',
    retry: 'Try again',
    signOut: 'Sign out',
    comingSoon: 'Transfer history and queue controls are coming in the next milestone.',
    server: 'Server',
    apiCompatibility: 'API compatibility',
    legacy: 'Legacy / unknown',
    objects: 'items',
    folders: 'Folders',
  },
  zh: {
    addServer: '连接 Garage UI',
    serverHint: '请输入 Garage UI 服务地址。',
    serverUrl: '服务器地址',
    testConnection: '测试连接',
    testing: '正在测试…',
    compatible: '连接成功',
    legacyApi: '已连接，但服务器未报告 API 版本。仅允许 Debug 联调。',
    login: '登录',
    username: '用户名',
    password: '密码',
    signingIn: '正在登录…',
    buckets: '存储桶',
    files: '文件',
    transfers: '传输',
    settings: '设置',
    noBuckets: '暂无可用存储桶',
    noObjects: '此文件夹为空',
    retry: '重试',
    signOut: '退出登录',
    comingSoon: '传输历史与队列控制将在下一里程碑实现。',
    server: '服务器',
    apiCompatibility: 'API 兼容性',
    legacy: '旧版 / 未知',
    objects: '项',
    folders: '文件夹',
  },
} as const;

export type StringKey = keyof typeof translations.en;

const language = getLocales()[0]?.languageCode === 'zh' ? 'zh' : 'en';

export function t(key: StringKey): string {
  return translations[language][key];
}
