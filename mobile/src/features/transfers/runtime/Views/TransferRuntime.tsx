import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { iosBackgroundDownloadEngine } from '@/features/transfers/download/Services/ios-background-download-engine';
import { iosForegroundUploadEngine } from '@/features/objects/upload/Services/ios-foreground-upload-engine';
import { useSessionStore } from '@/features/auth/session/session-store';

import { startTransferRuntime } from '../Services/transfer-runtime';

export function TransferRuntime() {
  const queryClient = useQueryClient();
  const serverId = useSessionStore((state) => state.server?.id);

  useEffect(() => {
    if (!serverId) return;
    let cleanup: (() => void) | undefined;
    let mounted = true;
    void startTransferRuntime(
      iosBackgroundDownloadEngine,
      iosForegroundUploadEngine,
      queryClient,
      serverId,
    ).then((stop) => {
      if (mounted) cleanup = stop;
      else stop();
    });
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [queryClient, serverId]);

  return null;
}
