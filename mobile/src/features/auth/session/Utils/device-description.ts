export function deviceSessionDescription(
  modelName: string | null,
  platform: string,
): { deviceName: string; devicePlatform: string } {
  const normalizedPlatform = platform.trim().toLowerCase() || 'mobile';
  return {
    deviceName: modelName?.trim() || fallbackDeviceName(normalizedPlatform),
    devicePlatform: normalizedPlatform,
  };
}

function fallbackDeviceName(platform: string): string {
  if (platform === 'ios') return 'iPhone';
  if (platform === 'android') return 'Android device';
  return 'Mobile device';
}
