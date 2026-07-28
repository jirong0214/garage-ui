import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

import type { PendingUpload, UploadCandidate } from '../Models/upload-candidate';
import {
  nextAvailableUploadName,
  uploadObjectExists,
} from '../Services/upload-conflicts';
import { enqueueObjectUploads } from '../Services/upload-coordinator';
import {
  captureUploadPhoto,
  pickUploadDocuments,
  pickUploadMedia,
} from '../Services/upload-source-picker';
import {
  normalizeUploadObjectName,
  uploadObjectKey,
} from '../Utils/upload-object-key';

type ConflictPolicy = 'skip' | 'replace' | 'keep-both' | 'cancel';

export function UploadComposer({
  profile,
  bucket,
  prefix,
}: {
  profile: ServerProfile;
  bucket: string;
  prefix: string;
}) {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectSource() {
    const labels = [t('uploadFromFiles'), t('uploadFromPhotos'), t('takePhoto'), t('cancel')];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: labels, cancelButtonIndex: 3, title: t('upload') },
        (index) => {
          if (index === 0) void pick(pickUploadDocuments);
          if (index === 1) void pick(pickUploadMedia);
          if (index === 2) void pick(captureUploadPhoto);
        },
      );
      return;
    }
    Alert.alert(t('upload'), undefined, [
      { text: labels[0], onPress: () => void pick(pickUploadDocuments) },
      { text: labels[1], onPress: () => void pick(pickUploadMedia) },
      { text: labels[2], onPress: () => void pick(captureUploadPhoto) },
      { text: labels[3], style: 'cancel' },
    ]);
  }

  async function pick(picker: () => Promise<UploadCandidate[]>) {
    try {
      const candidates = await picker();
      if (!candidates.length) return;
      setUploads(candidates.map((candidate) => ({ ...candidate, objectName: candidate.fileName })));
      setError(null);
      setVisible(true);
    } catch (pickerError) {
      Alert.alert(
        t('uploadSelectionFailed'),
        pickerError instanceof Error ? pickerError.message : undefined,
      );
    }
  }

  function updateName(id: string, objectName: string) {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, objectName } : upload)),
    );
    setError(null);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const normalized = uploads.map((upload) => ({
        ...upload,
        objectName: normalizeUploadObjectName(upload.objectName),
      }));
      const keys = normalized.map((upload) => uploadObjectKey(prefix, upload.objectName));
      if (new Set(keys).size !== keys.length) throw new Error(t('duplicateUploadNames'));

      const existence = await Promise.all(
        normalized.map((upload) =>
          uploadObjectExists(profile, bucket, uploadObjectKey(prefix, upload.objectName)),
        ),
      );
      const conflictCount = existence.filter(Boolean).length;
      let ready = normalized;
      if (conflictCount > 0) {
        const policy = await chooseConflictPolicy(conflictCount);
        if (policy === 'cancel') return;
        if (policy === 'skip') ready = normalized.filter((_, index) => !existence[index]);
        if (policy === 'keep-both') {
          ready = await Promise.all(
            normalized.map(async (upload, index) =>
              existence[index]
                ? {
                    ...upload,
                    objectName: await nextAvailableUploadName(
                      profile,
                      bucket,
                      prefix,
                      upload.objectName,
                    ),
                  }
                : upload,
            ),
          );
        }
      }

      if (!ready.length) {
        close();
        return;
      }
      const result = await enqueueObjectUploads(profile, bucket, prefix, ready);
      await queryClient.invalidateQueries({
        queryKey: ['objects', profile.id, bucket, prefix],
      });
      await queryClient.invalidateQueries({ queryKey: ['transfers', profile.id] });
      close();
      Alert.alert(
        t('uploadsQueued'),
        result.failed
          ? `${result.queued} ${t('queued')}, ${result.failed} ${t('failed')}`
          : `${result.queued} ${t('queued')}`,
      );
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('uploadFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  function close() {
    setVisible(false);
    setUploads([]);
    setError(null);
  }

  return (
    <>
      <Pressable
        accessibilityLabel={t('upload')}
        accessibilityRole="button"
        hitSlop={10}
        onPress={selectSource}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
        <Text style={styles.triggerLabel}>{t('upload')}</Text>
      </Pressable>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={visible}>
        <SafeAreaView edges={['bottom']} style={styles.modal}>
          <View style={styles.navigation}>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={close}
              style={styles.navigationButton}>
              <Text style={styles.cancelLabel}>{t('cancel')}</Text>
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>{t('reviewUploads')}</Text>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void submit()}
              style={styles.navigationButton}>
              <Text style={[styles.submitLabel, submitting && styles.disabled]}>
                {submitting ? t('preparingUploads') : t('upload')}
              </Text>
            </Pressable>
          </View>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.destination}>
                <Text style={styles.sectionLabel}>{t('destination')}</Text>
                <Text numberOfLines={2} style={styles.destinationValue}>
                  {bucket} / {prefix || t('bucketRoot')}
                </Text>
              </View>
              <Text style={styles.hint}>{t('uploadNameHint')}</Text>
              {uploads.map((upload) => (
                <View key={upload.id} style={styles.fileRow}>
                  <Text numberOfLines={1} style={styles.originalName}>{upload.fileName}</Text>
                  <TextInput
                    accessibilityLabel={`${t('objectName')}: ${upload.fileName}`}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!submitting}
                    onChangeText={(value) => updateName(upload.id, value)}
                    selectTextOnFocus
                    style={styles.nameInput}
                    value={upload.objectName}
                  />
                </View>
              ))}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function chooseConflictPolicy(count: number): Promise<ConflictPolicy> {
  return new Promise((resolve) => {
    Alert.alert(t('uploadConflictsTitle'), `${count} ${t('uploadConflictsMessage')}`, [
      { text: t('skipExisting'), onPress: () => resolve('skip') },
      { text: t('replaceExisting'), style: 'destructive', onPress: () => resolve('replace') },
      { text: t('keepBoth'), onPress: () => resolve('keep-both') },
      { text: t('cancel'), style: 'cancel', onPress: () => resolve('cancel') },
    ]);
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  trigger: { minWidth: 54, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  triggerLabel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.55 },
  modal: { flex: 1, backgroundColor: colors.background },
  navigation: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
    paddingHorizontal: 8,
  },
  navigationButton: { minWidth: 72, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  cancelLabel: { color: colors.accent, fontSize: 16 },
  submitLabel: { color: colors.accent, fontSize: 16, fontWeight: '600', textAlign: 'right' },
  disabled: { opacity: 0.5 },
  title: { flex: 1, color: colors.label, fontSize: 17, fontWeight: '600', textAlign: 'center' },
  content: { gap: 12, padding: 16, paddingBottom: 36 },
  destination: { gap: 5, padding: 14, borderRadius: 12, backgroundColor: colors.surface },
  sectionLabel: {
    color: colors.secondaryLabel,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  destinationValue: { color: colors.label, fontSize: 16, lineHeight: 22 },
  hint: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  fileRow: { gap: 6, padding: 12, borderRadius: 12, backgroundColor: colors.surface },
  originalName: { color: colors.secondaryLabel, fontSize: 12 },
  nameInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.separator,
    borderRadius: 10,
    paddingHorizontal: 11,
    backgroundColor: colors.background,
    color: colors.label,
    fontSize: 16,
  },
  error: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
