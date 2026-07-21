import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './top-bar';

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({theme: 'light', setTheme: vi.fn()}),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: () => ({user: null, config: null, logout: vi.fn()}),
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('TopBar navigation', () => {
  it('moves backward and forward through router history', async () => {
    render(
      <MemoryRouter initialEntries={['/buckets', '/buckets/default-bucket/objects']} initialIndex={1}>
        <TopBar crumbs={[{label: 'Buckets'}, {label: 'default-bucket'}, {label: 'Objects'}]} />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Back'}));
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/buckets'));

    fireEvent.click(screen.getByRole('button', {name: 'Forward'}));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/buckets/default-bucket/objects');
    });
  });
});
