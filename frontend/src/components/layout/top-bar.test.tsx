import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './top-bar';

vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({theme: 'light', setTheme: vi.fn()}),
}));

vi.mock('@/store/auth-store', () => ({
  useAuthStore: () => ({user: null, config: null, logout: vi.fn()}),
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">{location.pathname}</div>
      <button type="button" onClick={() => navigate('/buckets/default-bucket/objects')}>Open bucket</button>
    </>
  );
}

describe('TopBar navigation', () => {
  it('moves backward and forward through router history', async () => {
    render(
      <MemoryRouter initialEntries={['/outside', '/buckets']} initialIndex={1}>
        <TopBar crumbs={[{label: 'Buckets'}, {label: 'default-bucket'}, {label: 'Objects'}]} />
        <LocationProbe />
      </MemoryRouter>,
    );

    const back = screen.getByRole('button', {name: 'Back'});
    const forward = screen.getByRole('button', {name: 'Forward'});
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();
    fireEvent.click(back);
    expect(screen.getByTestId('location')).toHaveTextContent('/buckets');

    fireEvent.click(screen.getByRole('button', {name: 'Open bucket'}));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/buckets/default-bucket/objects');
    });
    expect(back).toBeEnabled();
    expect(forward).toBeDisabled();

    fireEvent.click(back);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/buckets'));
    expect(back).toBeDisabled();
    expect(forward).toBeEnabled();

    fireEvent.click(forward);
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/buckets/default-bucket/objects');
    });
  });
});
