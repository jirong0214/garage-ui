import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { objectsApi } from '@/lib/api';
import { copyText } from '@/lib/utils';
import { ShareObjectDialog } from './ShareObjectDialog';

vi.mock('@/lib/api', () => ({
  objectsApi: { getPresignedUrl: vi.fn() },
}));

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  copyText: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('ShareObjectDialog', () => {
  it('generates first and copies only on a separate user action', async () => {
    const signedURL = 'https://s3.example.com/bucket/image.png?X-Amz-Signature=test';
    vi.mocked(objectsApi.getPresignedUrl).mockResolvedValue(signedURL);
    vi.mocked(copyText).mockResolvedValue(undefined);

    render(
      <ShareObjectDialog
        open
        onOpenChange={vi.fn()}
        bucketName="bucket"
        objectKey="image.png"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Generate URL' }));

    const input = await screen.findByRole('textbox', { name: 'Signed URL' });
    expect(input).toHaveValue(signedURL);
    expect(copyText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Copy signed URL' }));
    await waitFor(() => expect(copyText).toHaveBeenCalledWith(signedURL));
  });
});
