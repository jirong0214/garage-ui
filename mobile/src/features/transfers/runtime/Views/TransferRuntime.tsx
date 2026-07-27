import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { iosBackgroundDownloadEngine } from '@/features/transfers/download/Services/ios-background-download-engine';

import { startTransferRuntime } from '../Services/transfer-runtime';

export function TransferRuntime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let mounted = true;
    void startTransferRuntime(iosBackgroundDownloadEngine, queryClient).then((stop) => {
      if (mounted) cleanup = stop;
      else stop();
    });
    return () => {
      mounted = false;
      cleanup?.();
    };
  }, [queryClient]);

  return null;
}
