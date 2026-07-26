import type { PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type TextInputProps,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from './theme';

export function Screen({ children }: PropsWithChildren) {
  return <SafeAreaView style={styles.screen}>{children}</SafeAreaView>;
}

export function Field(props: TextInputProps) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      clearButtonMode="while-editing"
      placeholderTextColor={colors.secondaryLabel}
      style={styles.field}
      {...props}
    />
  );
}

export function PrimaryButton({
  label,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
      ]}>
      {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonLabel}>{label}</Text>}
    </Pressable>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry}>
          <Text style={styles.retry}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  field: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.surface,
    color: colors.label,
    paddingHorizontal: 14,
    fontSize: 17,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.75 },
  buttonLabel: { color: 'white', fontSize: 17, fontWeight: '600' },
  error: { gap: 8, paddingVertical: 4 },
  errorText: { color: colors.danger, fontSize: 15 },
  retry: { color: colors.accent, fontSize: 16, fontWeight: '600' },
});
