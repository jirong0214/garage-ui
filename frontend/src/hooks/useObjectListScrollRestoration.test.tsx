import {renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {useObjectListScrollRestoration} from './useObjectListScrollRestoration';

describe('useObjectListScrollRestoration', () => {
  let region: HTMLElement;

  beforeEach(() => {
    sessionStorage.clear();
    region = document.createElement('main');
    region.className = 'app-scroll-region';
    document.body.appendChild(region);
  });

  afterEach(() => {
    region.remove();
  });

  it('saves the current app scroll position when the list unmounts', () => {
    const {unmount} = renderHook(() => useObjectListScrollRestoration('/buckets/pics/objects', false));
    region.scrollTop = 640;
    region.dispatchEvent(new Event('scroll'));
    unmount();

    expect(sessionStorage.getItem('garage-ui:object-list-scroll:/buckets/pics/objects')).toBe('640');
  });

  it('waits for loading to finish before restoring the saved position', () => {
    sessionStorage.setItem('garage-ui:object-list-scroll:/buckets/pics/objects?prefix=phone%2F', '480');
    const {rerender} = renderHook(
      ({loading}) => useObjectListScrollRestoration('/buckets/pics/objects?prefix=phone%2F', loading),
      {initialProps: {loading: false}},
    );

    expect(region.scrollTop).toBe(0);
    rerender({loading: true});
    expect(region.scrollTop).toBe(0);
    rerender({loading: false});
    expect(region.scrollTop).toBe(480);
  });

  it('stores and restores independent positions for different list URLs', () => {
    sessionStorage.setItem('garage-ui:object-list-scroll:/buckets/pics/objects?prefix=second%2F', '220');
    const {rerender} = renderHook(
      ({keyName, loading}) => useObjectListScrollRestoration(keyName, loading),
      {initialProps: {keyName: '/buckets/pics/objects?prefix=first%2F', loading: false}},
    );

    region.scrollTop = 360;
    region.dispatchEvent(new Event('scroll'));
    rerender({keyName: '/buckets/pics/objects?prefix=second%2F', loading: true});
    expect(sessionStorage.getItem('garage-ui:object-list-scroll:/buckets/pics/objects?prefix=first%2F')).toBe('360');
    rerender({keyName: '/buckets/pics/objects?prefix=second%2F', loading: false});
    expect(region.scrollTop).toBe(220);
  });
});
