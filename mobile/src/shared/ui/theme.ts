import { PlatformColor, type ColorValue } from 'react-native';

export const colors: Record<string, ColorValue> = {
  background: PlatformColor('systemGroupedBackground'),
  surface: PlatformColor('secondarySystemGroupedBackground'),
  label: PlatformColor('label'),
  secondaryLabel: PlatformColor('secondaryLabel'),
  separator: PlatformColor('separator'),
  accent: PlatformColor('systemBlue'),
  danger: PlatformColor('systemRed'),
  success: PlatformColor('systemGreen'),
  fill: PlatformColor('tertiarySystemFill'),
};
