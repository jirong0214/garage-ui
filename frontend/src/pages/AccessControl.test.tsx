import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { accessApi } from '@/lib/api';
import { copyText } from '@/lib/utils';
import { AccessControl } from './AccessControl';

vi.mock('@/lib/api', () => ({
  accessApi: {
    listKeys: vi.fn(),
    getSecretKey: vi.fn(),
  },
  bucketsApi: {},
}));

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  copyText: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {success: vi.fn(), error: vi.fn()},
}));

function renderAccessControl() {
  const queryClient = new QueryClient({defaultOptions: {queries: {retry: false}}});
  return render(
    <QueryClientProvider client={queryClient}>
      <AccessControl />
    </QueryClientProvider>,
  );
}

describe('AccessControl copying', () => {
  it('uses the compatible clipboard helper for access and secret keys', async () => {
    vi.mocked(accessApi.listKeys).mockResolvedValue([{
      accessKeyId: 'GK123456',
      name: 'Uploader',
      createdAt: '2026-07-21T00:00:00Z',
      status: 'active',
      permissions: [],
    }]);
    vi.mocked(accessApi.getSecretKey).mockResolvedValue('secret-value');
    vi.mocked(copyText).mockResolvedValue(undefined);
    renderAccessControl();

    const copyAccessKey = await screen.findByRole('button', {name: 'Copy Access Key ID GK123456'});
    fireEvent.click(copyAccessKey);
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('GK123456'));

    fireEvent.click(screen.getByText('Uploader'));
    const copySecret = await screen.findByRole('button', {name: 'Copy Secret Access Key'});
    await waitFor(() => expect(copySecret).toBeEnabled());
    fireEvent.click(copySecret);
    await waitFor(() => expect(copyText).toHaveBeenCalledWith('secret-value'));
  });
});
