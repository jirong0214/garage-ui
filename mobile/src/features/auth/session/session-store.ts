import { create } from 'zustand';

import type { ServerProfile } from '@/features/server/configuration/server-model';
import { getActiveServer } from '@/infrastructure/database/server-repository';

type SessionState = {
  ready: boolean;
  server: ServerProfile | null;
  authenticated: boolean;
  bootstrap(): Promise<void>;
  setServer(server: ServerProfile | null): void;
  setAuthenticated(authenticated: boolean): void;
};

export const useSessionStore = create<SessionState>((set) => ({
  ready: false,
  server: null,
  authenticated: false,
  async bootstrap() {
    const server = await getActiveServer();
    set({ server, ready: true });
  },
  setServer(server) {
    set({ server });
  },
  setAuthenticated(authenticated) {
    set({ authenticated });
  },
}));
