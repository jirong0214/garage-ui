import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';
import {Select, SelectOption} from './select';

const triggerRect: DOMRect = {
  x: 300,
  y: 100,
  top: 100,
  right: 340,
  bottom: 140,
  left: 300,
  width: 40,
  height: 40,
  toJSON: () => ({}),
};

describe('floating controls', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(triggerRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders select options in a viewport-positioned portal', () => {
    render(
      <div style={{overflow: 'hidden'}}>
        <Select value="900">
          <SelectOption value="900">15 minutes</SelectOption>
          <SelectOption value="3600">1 hour</SelectOption>
          <SelectOption value="86400">1 day</SelectOption>
          <SelectOption value="604800">7 days</SelectOption>
        </Select>
      </div>,
    );

    fireEvent.click(screen.getByRole('button', {name: '15 minutes'}));

    const menu = screen.getByText('7 days').parentElement?.parentElement;
    expect(menu?.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({position: 'fixed', top: '144px'});
  });

  it('positions a dropdown at its trigger on its first visible frame', () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger aria-label="Object actions">...</DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>View</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Object actions'}));

    const content = screen.getByText('View').parentElement?.parentElement;
    expect(content?.parentElement).toBe(document.body);
    expect(content).toHaveStyle({position: 'fixed', top: '148px'});
    expect(content).not.toHaveStyle({top: '0px', left: '0px'});
  });
});
