import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { deviceSessionDescription } from '../Utils/device-description';

export function currentDeviceSessionDescription() {
  return deviceSessionDescription(Device.modelName, Platform.OS);
}
