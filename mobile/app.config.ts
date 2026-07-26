import type { ConfigContext, ExpoConfig } from 'expo/config';

import appJson from './app.json';

export default ({ config }: ConfigContext): ExpoConfig => {
  const debugLanHttp = process.env.GARAGE_UI_DEBUG_LAN_HTTP === '1';
  const staticConfig = appJson.expo as ExpoConfig;

  return {
    ...config,
    ...staticConfig,
    extra: {
      ...config.extra,
      debugLanHttp,
    },
    ios: {
      ...staticConfig.ios,
      infoPlist: {
        NSAppTransportSecurity: debugLanHttp
          ? {
              NSAllowsArbitraryLoads: true,
              NSAllowsLocalNetworking: true,
            }
          : {
              NSAllowsArbitraryLoads: false,
              NSAllowsLocalNetworking: false,
            },
      },
    },
    plugins: [...(staticConfig.plugins ?? []), 'expo-localization'],
  };
};
