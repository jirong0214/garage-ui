import { describe, expect, it } from 'vitest';

import { deviceSessionDescription } from './device-description';

describe('deviceSessionDescription', () => {
  it('uses the hardware model without requesting the user-assigned device name', () => {
    expect(deviceSessionDescription('iPhone SE (3rd generation)', 'ios')).toEqual({
      deviceName: 'iPhone SE (3rd generation)',
      devicePlatform: 'ios',
    });
  });

  it('provides a non-identifying platform fallback', () => {
    expect(deviceSessionDescription(null, 'android')).toEqual({
      deviceName: 'Android device',
      devicePlatform: 'android',
    });
  });
});
