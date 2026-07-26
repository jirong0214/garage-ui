import Constants from 'expo-constants';

export function isDebugLanHttpEnabled(): boolean {
  return __DEV__ && Constants.expoConfig?.extra?.debugLanHttp === true;
}
