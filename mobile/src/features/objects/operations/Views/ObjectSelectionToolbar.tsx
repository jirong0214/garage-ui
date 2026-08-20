import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export function ObjectSelectionToolbar({
  count,
  canRename,
  canCopy,
  canMove,
  canDelete,
  busy,
  onCancel,
  onRename,
  onCopy,
  onMove,
  onDelete,
}: {
  count: number;
  canRename: boolean;
  canCopy: boolean;
  canMove: boolean;
  canDelete: boolean;
  busy: boolean;
  onCancel(): void;
  onRename(): void;
  onCopy(): void;
  onMove(): void;
  onDelete(): void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text accessibilityLiveRegion="polite" style={styles.count}>{count} {t('selected')}</Text>
        <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.cancel}>
          <Text style={styles.cancelLabel}>{t('done')}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal contentContainerStyle={styles.actions} showsHorizontalScrollIndicator={false}>
        {canRename ? <Action label={t('rename')} onPress={onRename} /> : null}
        {canCopy ? <Action label={t('copy')} onPress={onCopy} /> : null}
        {canMove ? <Action label={t('move')} onPress={onMove} /> : null}
        {canDelete ? <Action destructive label={t('delete')} onPress={onDelete} /> : null}
      </ScrollView>
    </View>
  );
}

function Action({ label, destructive, onPress }: { label: string; destructive?: boolean; onPress(): void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <Text style={[styles.actionLabel, destructive && styles.destructive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.separator, paddingVertical: 6 },
  heading: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  count: { color: colors.label, fontSize: 17, fontWeight: '600' },
  cancel: { minWidth: 54, minHeight: 36, alignItems: 'flex-end', justifyContent: 'center' },
  cancelLabel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  actions: { gap: 8, paddingHorizontal: 12 },
  action: { minWidth: 70, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: colors.fill, paddingHorizontal: 14 },
  actionLabel: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  destructive: { color: colors.danger },
  pressed: { opacity: 0.55 },
});
