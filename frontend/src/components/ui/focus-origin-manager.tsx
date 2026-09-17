import {useEffect} from 'react';

const pointerFocusableSelector = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[tabindex]',
].join(',');

function isFocusableTarget(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    !element.matches(':disabled') &&
    element.getAttribute('aria-disabled') !== 'true'
  );
}

/**
 * Keeps browser focus indicators tied to the input modality that established
 * focus. Browsers can start matching :focus-visible after Escape even when a
 * control was originally focused with the pointer, so pointer focus is marked
 * explicitly and styled separately in index.css.
 */
export function FocusOriginManager() {
  useEffect(() => {
    const markPointerFocus = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const focusTarget = event.target.closest<HTMLElement>(pointerFocusableSelector);
      if (!focusTarget || !isFocusableTarget(focusTarget)) return;
      focusTarget.dataset.focusOrigin = 'pointer';
    };

    const clearKeyboardFocusMarker = (event: KeyboardEvent) => {
      // Escape closes transient UI but does not establish keyboard navigation.
      if (event.key === 'Escape') return;
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) delete activeElement.dataset.focusOrigin;
    };

    const clearBlurredFocusMarker = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement) delete event.target.dataset.focusOrigin;
    };

    document.addEventListener('pointerdown', markPointerFocus, true);
    document.addEventListener('keydown', clearKeyboardFocusMarker, true);
    document.addEventListener('blur', clearBlurredFocusMarker, true);

    return () => {
      document.removeEventListener('pointerdown', markPointerFocus, true);
      document.removeEventListener('keydown', clearKeyboardFocusMarker, true);
      document.removeEventListener('blur', clearBlurredFocusMarker, true);
    };
  }, []);

  return null;
}
