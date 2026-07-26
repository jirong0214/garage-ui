import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

import {
  getDeviceSessionStatus,
  sortDeviceSessions,
  type DeviceSession,
  type DeviceSessionStatus,
} from '../Models/device-session';

export type DeviceSessionsSectionProps = {
  sessions: readonly DeviceSession[];
  loading: boolean;
  error: Error | string | null;
  onRetry(): void;
  onRevoke(session: DeviceSession): void;
};

export function DeviceSessionsSection({
  sessions,
  loading,
  error,
  onRetry,
  onRevoke,
}: DeviceSessionsSectionProps) {
  const sortedSessions = useMemo(() => sortDeviceSessions(sessions), [sessions]);

  function requestRevoke(session: DeviceSession) {
    if (!session.current) {
      onRevoke(session);
      return;
    }
    Alert.alert(t('revokeCurrentSessionTitle'), t('revokeCurrentSessionMessage'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('revokeCurrentDevice'),
        style: 'destructive',
        onPress: () => onRevoke(session),
      },
    ]);
  }

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{t('deviceSessions')}</Text>
        <Text style={styles.subtitle}>{t('deviceSessionsHint')}</Text>
      </View>

      {loading && sessions.length === 0 ? (
        <View accessibilityLabel={t('loadingDeviceSessions')} style={styles.state}>
          <ActivityIndicator />
          <Text style={styles.stateText}>{t('loadingDeviceSessions')}</Text>
        </View>
      ) : null}

      {error ? (
        <View accessibilityRole="alert" style={styles.errorState}>
          <Text style={styles.errorText}>{error instanceof Error ? error.message : error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
            <Text style={styles.retryLabel}>{t('retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error && sortedSessions.length === 0 ? (
        <Text style={styles.emptyText}>{t('noDeviceSessions')}</Text>
      ) : null}

      {sortedSessions.map((session) => (
        <DeviceSessionCard
          key={session.id}
          onRevoke={() => requestRevoke(session)}
          session={session}
        />
      ))}
    </View>
  );
}

function DeviceSessionCard({
  session,
  onRevoke,
}: {
  session: DeviceSession;
  onRevoke(): void;
}) {
  const status = getDeviceSessionStatus(session);
  const revoked = status === 'revoked';
  const deviceName = session.device_name.trim() || t('unknownDevice');

  return (
    <View style={[styles.card, revoked && styles.cardInactive]}>
      <View style={styles.cardHeader}>
        <View style={styles.deviceIdentity}>
          <Text numberOfLines={2} style={styles.deviceName}>{deviceName}</Text>
          <Text numberOfLines={1} style={styles.platform}>
            {session.device_platform.trim() || t('unknownPlatform')}
          </Text>
        </View>
        <View style={styles.badges}>
          {session.current ? (
            <View style={[styles.badge, styles.currentBadge]}>
              <Text style={[styles.badgeText, styles.currentBadgeText]}>{t('currentDevice')}</Text>
            </View>
          ) : null}
          <StatusBadge status={status} />
        </View>
      </View>

      <View style={styles.metadata}>
        <Text style={styles.metadataText}>
          {t('lastUsed')}: {formatSessionDate(session.last_used_at)}
        </Text>
        <Text style={styles.metadataText}>
          {status === 'revoked' ? t('revokedAt') : t('expiresAt')}:{' '}
          {formatSessionDate(status === 'revoked' ? session.revoked_at : session.expires_at)}
        </Text>
      </View>

      <Pressable
        accessibilityHint={session.current ? t('revokeCurrentSessionHint') : undefined}
        accessibilityRole="button"
        disabled={revoked}
        onPress={onRevoke}
        style={({ pressed }) => [
          styles.revokeButton,
          session.current && styles.currentRevokeButton,
          revoked && styles.disabledButton,
          pressed && styles.pressed,
        ]}>
        <Text
          style={[
            styles.revokeLabel,
            session.current && styles.currentRevokeLabel,
            revoked && styles.disabledLabel,
          ]}>
          {revoked
            ? t('sessionRevoked')
            : session.current
              ? t('revokeCurrentDevice')
              : t('revokeSession')}
        </Text>
      </Pressable>
    </View>
  );
}

function StatusBadge({ status }: { status: DeviceSessionStatus }) {
  return (
    <View
      style={[
        styles.badge,
        status === 'active' && styles.activeBadge,
        status !== 'active' && styles.inactiveBadge,
      ]}>
      <Text
        style={[
          styles.badgeText,
          status === 'active' ? styles.activeBadgeText : styles.inactiveBadgeText,
        ]}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

function statusLabel(status: DeviceSessionStatus): string {
  if (status === 'revoked') return t('sessionRevoked');
  if (status === 'expired') return t('sessionExpired');
  return t('sessionActive');
}

function formatSessionDate(value: string | null): string {
  if (!value) return t('unknownDate');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? t('unknownDate') : date.toLocaleString();
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { gap: 5 },
  title: { color: colors.label, fontSize: 22, fontWeight: '700' },
  subtitle: { color: colors.secondaryLabel, fontSize: 15, lineHeight: 21 },
  state: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  stateText: { color: colors.secondaryLabel, fontSize: 15 },
  errorState: {
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger, fontSize: 15, lineHeight: 21 },
  retryButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: colors.fill,
  },
  retryLabel: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  emptyText: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    color: colors.secondaryLabel,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  card: { gap: 13, padding: 14, borderRadius: 14, backgroundColor: colors.surface },
  cardInactive: { opacity: 0.72 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  deviceIdentity: { flex: 1, minWidth: 0, gap: 3 },
  deviceName: { color: colors.label, fontSize: 17, fontWeight: '600' },
  platform: { color: colors.secondaryLabel, fontSize: 14 },
  badges: {
    maxWidth: '52%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 5,
  },
  badge: { minHeight: 24, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '600' },
  currentBadge: { backgroundColor: colors.fill },
  currentBadgeText: { color: colors.accent },
  activeBadge: { backgroundColor: colors.fill },
  activeBadgeText: { color: colors.success },
  inactiveBadge: { backgroundColor: colors.fill },
  inactiveBadgeText: { color: colors.secondaryLabel },
  metadata: { gap: 4 },
  metadataText: { color: colors.secondaryLabel, fontSize: 13, lineHeight: 18 },
  revokeButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: colors.fill,
  },
  currentRevokeButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.danger,
  },
  revokeLabel: { color: colors.danger, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  currentRevokeLabel: { fontWeight: '700' },
  disabledButton: { opacity: 0.55 },
  disabledLabel: { color: colors.secondaryLabel },
  pressed: { opacity: 0.65 },
});
