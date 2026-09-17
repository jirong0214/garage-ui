import {fireEvent, render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {FocusOriginManager} from './focus-origin-manager';

describe('FocusOriginManager', () => {
  it('marks pointer-focused controls and keeps the marker through Escape', () => {
    const {container} = render(
      <>
        <FocusOriginManager />
        <button type="button">Action</button>
      </>,
    );
    const button = container.querySelector('button')!;

    fireEvent.pointerDown(button);
    button.focus();
    fireEvent.keyDown(document, {key: 'Escape'});

    expect(button).toHaveAttribute('data-focus-origin', 'pointer');

    fireEvent.keyDown(document, {key: 'Tab'});
    expect(button).not.toHaveAttribute('data-focus-origin');
  });

  it('clears the pointer marker when the control loses focus', () => {
    const {container} = render(
      <>
        <FocusOriginManager />
        <button type="button">Action</button>
      </>,
    );
    const button = container.querySelector('button')!;

    fireEvent.pointerDown(button);
    button.focus();
    fireEvent.blur(button);

    expect(button).not.toHaveAttribute('data-focus-origin');
  });
});
