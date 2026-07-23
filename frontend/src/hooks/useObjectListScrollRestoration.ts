import {useLayoutEffect, useRef} from 'react';

const STORAGE_PREFIX = 'garage-ui:object-list-scroll:';

function getScrollRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-scroll-region');
}

function readScrollPosition(key: string): number {
  try {
    const value = Number(sessionStorage.getItem(STORAGE_PREFIX + key));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeScrollPosition(key: string, position: number) {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, String(Math.max(0, position)));
  } catch {
    // Scroll restoration remains best-effort when storage is unavailable.
  }
}

/**
 * Saves the app scroll container when an object list is left and restores it
 * only after the list's initial request completes. Waiting for that request
 * prevents the short loading layout from clamping a restored position to zero.
 */
export function useObjectListScrollRestoration(storageKey: string, isLoading: boolean) {
  const stateRef = useRef({
    key: storageKey,
    sawLoading: false,
    restored: false,
  });

  useLayoutEffect(() => {
    const region = getScrollRegion();
    let lastKnownPosition = region?.scrollTop ?? 0;
    const handleScroll = () => {
      if (region) lastKnownPosition = region.scrollTop;
    };
    region?.addEventListener('scroll', handleScroll, {passive: true});
    return () => {
      region?.removeEventListener('scroll', handleScroll);
      writeScrollPosition(storageKey, lastKnownPosition);
    };
  }, [storageKey]);

  useLayoutEffect(() => {
    if (stateRef.current.key !== storageKey) {
      stateRef.current = {key: storageKey, sawLoading: false, restored: false};
    }
    if (isLoading) {
      stateRef.current.sawLoading = true;
      return;
    }
    if (!stateRef.current.sawLoading || stateRef.current.restored) return;

    const region = getScrollRegion();
    if (region) region.scrollTop = readScrollPosition(storageKey);
    stateRef.current.restored = true;
  }, [isLoading, storageKey]);
}
