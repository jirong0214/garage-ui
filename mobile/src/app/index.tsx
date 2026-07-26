import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { authStorage } from '@/features/auth/session/auth-storage';
import { useSessionStore } from '@/features/auth/session/session-store';
import { Screen } from '@/shared/ui/components';

export default function BootstrapScreen() {
  const ready = useSessionStore((state) => state.ready);
  const server = useSessionStore((state) => state.server);
  const authenticated = useSessionStore((state) => state.authenticated);

  if (!ready) {
    return (
      <Screen>
        <ActivityIndicator style={styles.spinner} />
      </Screen>
    );
  }
  if (!server) return <Redirect href="/server" />;
  if (authenticated) return <Redirect href="/(tabs)/files" />;

  return <SessionRedirect serverId={server.id} />;
}

function SessionRedirect({ serverId }: { serverId: string }) {
  const setAuthenticated = useSessionStore((state) => state.setAuthenticated);
  const [checked, setChecked] = React.useState(false);
  const [hasToken, setHasToken] = React.useState(false);

  React.useEffect(() => {
    authStorage.getToken(serverId).then((token) => {
      setHasToken(Boolean(token));
      if (token) setAuthenticated(true);
      setChecked(true);
    });
  }, [serverId, setAuthenticated]);

  if (!checked) {
    return (
      <Screen>
        <ActivityIndicator style={styles.spinner} />
      </Screen>
    );
  }
  return <Redirect href={hasToken ? '/(tabs)/files' : '/login'} />;
}

const styles = StyleSheet.create({ spinner: { flex: 1 } });
