import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

import { renamedFolderPrefix, renamedObjectKey } from '../Models/object-operation';

export function RenameObjectDialog({
  sourceKey,
  folder,
  visible,
  submitting,
  error,
  onCancel,
  onRename,
}: {
  sourceKey: string | null;
  folder: boolean;
  visible: boolean;
  submitting: boolean;
  error: string | null;
  onCancel(): void;
  onRename(destinationKey: string): void;
}) {
  const originalName = sourceKey?.split('/').filter(Boolean).at(-1) ?? '';
  const [name, setName] = useState(originalName);

  let destinationKey: string | null = null;
  let validationError: string | null = null;
  if (sourceKey) {
    try {
      destinationKey = folder
        ? renamedFolderPrefix(sourceKey, name)
        : renamedObjectKey(sourceKey, name);
      if (destinationKey === sourceKey) validationError = t('renameUnchanged');
    } catch {
      validationError = t('invalidObjectName');
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.navigation}>
            <DialogButton disabled={submitting} label={t('cancel')} onPress={onCancel} />
            <Text accessibilityRole="header" style={styles.title}>{t('renameObject')}</Text>
            <DialogButton
              disabled={submitting || Boolean(validationError) || !destinationKey}
              emphasized
              label={submitting ? t('renaming') : t('rename')}
              onPress={() => destinationKey && onRename(destinationKey)}
            />
          </View>
          <View style={styles.content}>
            <Text style={styles.label}>{t('objectName')}</Text>
            <TextInput
              accessibilityLabel={t('objectName')}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!submitting}
              onChangeText={setName}
              selectTextOnFocus
              style={styles.input}
              value={name}
            />
            {validationError ? <Text accessibilityRole="alert" style={styles.hint}>{validationError}</Text> : null}
            {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function DialogButton({ label, disabled, emphasized, onPress }: {
  label: string;
  disabled?: boolean;
  emphasized?: boolean;
  onPress(): void;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={styles.button}>
      <Text style={[styles.buttonLabel, emphasized && styles.emphasized, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background },
  navigation: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    paddingHorizontal: 8,
  },
  title: { flex: 1, color: colors.label, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  button: { minWidth: 72, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  buttonLabel: { color: colors.accent, fontSize: 16 },
  emphasized: { fontWeight: '600', textAlign: 'right' },
  disabled: { opacity: 0.4 },
  content: { gap: 8, padding: 20 },
  label: { color: colors.secondaryLabel, fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  input: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    color: colors.label,
    fontSize: 17,
  },
  hint: { color: colors.secondaryLabel, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
});
