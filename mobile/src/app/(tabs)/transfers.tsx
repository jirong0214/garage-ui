import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export default function TransfersScreen() {
  return (
    <View style={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>{t('transfers')}</Text>
      <Text style={styles.body}>{t('comingSoon')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', padding: 24, gap: 8, backgroundColor: colors.background },
  title: { color: colors.label, fontSize: 28, fontWeight: '700' },
  body: { color: colors.secondaryLabel, fontSize: 17, lineHeight: 24 },
});
