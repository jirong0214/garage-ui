import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router, Stack, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useSessionStore } from '@/features/auth/session/session-store';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 30_000 },
          mutations: { retry: false },
        },
      }),
  );
  const bootstrap = useSessionStore((state) => state.bootstrap);
  const authenticated = useSessionStore((state) => state.authenticated);
  const ready = useSessionStore((state) => state.ready);
  const server = useSessionStore((state) => state.server);
  const colorScheme = useColorScheme();
  const segments = useSegments();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (ready && server && !authenticated && segments[0] === '(tabs)') {
      router.replace('/login');
    }
  }, [authenticated, ready, segments, server]);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="server" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
