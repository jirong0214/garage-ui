import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  fetchDeviceSessions,
  logoutCurrentSession,
  revokeSession,
} from '@/features/auth/device-sessions/Services/device-sessions-api';
import type { DeviceSession } from '@/features/auth/device-sessions/Models/device-session';
import { DeviceSessionsSection } from '@/features/auth/device-sessions/Views/DeviceSessionsSection';
import { authStorage } from '@/features/auth/session/auth-storage';
import { useSessionStore } from '@/features/auth/session/session-store';
import { t } from '@/shared/i18n/strings';
import { colors } from '@/shared/ui/theme';

export default function SettingsScreen() {
  const server = useSessionStore((state) => state.server);
  const setAuthenticated = useSessionStore((state) => state.setAuthenticated);
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ['device-sessions', server?.id],
    queryFn: () => {
      if (!server) throw new Error('Choose a server first.');
      return fetchDeviceSessions(server);
    },
    enabled: Boolean(server),
  });
  const revokeMutation = useMutation({
    mutationFn: async (session: DeviceSession) => {
      if (!server) throw new Error('Choose a server first.');
      await revokeSession(server, session.id);
      return session;
    },
    async onSuccess(session) {
      if (session.current && server) {
        await completeLocalSignOut(server.id);
        return;
      }
      await sessionsQuery.refetch();
    },
  });

  async function signOut() {
    if (!server) return;
    try {
      await logoutCurrentSession(server);
    } catch {
      // Local sign-out must remain available while the server is offline.
    }
    await completeLocalSignOut(server.id);
  }

  async function completeLocalSignOut(serverId: string) {
    await authStorage.clearToken(serverId);
    queryClient.clear();
    setAuthenticated(false);
    router.replace('/login');
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text accessibilityRole="header" style={styles.title}>{t('settings')}</Text>
      <View style={styles.group}>
        <Text style={styles.label}>{t('server')}</Text>
        <Text selectable style={styles.value}>{server?.baseUrl}</Text>
        <View style={styles.separator} />
        <Text style={styles.label}>{t('apiCompatibility')}</Text>
        <Text style={styles.value}>{server?.apiVersion ?? t('legacy')}</Text>
      </View>
      <DeviceSessionsSection
        error={
          revokeMutation.error ??
          (sessionsQuery.error instanceof Error ? sessionsQuery.error : null)
        }
        loading={sessionsQuery.isLoading || revokeMutation.isPending}
        onRetry={() => void sessionsQuery.refetch()}
        onRevoke={(session) => revokeMutation.mutate(session)}
        sessions={sessionsQuery.data ?? []}
      />
      <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flexGrow: 1, padding: 20, paddingTop: 70, paddingBottom: 40, gap: 20, backgroundColor: colors.background },
  title: { color: colors.label, fontSize: 34, fontWeight: '700' },
  group: { borderRadius: 14, backgroundColor: colors.surface, padding: 16, gap: 7 },
  label: { color: colors.secondaryLabel, fontSize: 13, textTransform: 'uppercase' },
  value: { color: colors.label, fontSize: 16, marginBottom: 7 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.separator, marginVertical: 5 },
  signOut: { minHeight: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  signOutText: { color: colors.danger, fontSize: 17, fontWeight: '600' },
});
