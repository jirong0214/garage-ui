import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {copyText} from '@/lib/utils';
import {ObjectsTable} from './ObjectsTable';

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils')>()),
  copyText: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {success: vi.fn(), error: vi.fn()},
}));

describe('ObjectsTable', () => {
  it('exposes public URL copying as a dedicated row action', async () => {
    vi.mocked(copyText).mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <ObjectsTable
          bucketName="photos"
          publicBaseURL="https://cdn.example.com"
          canShare={false}
          objects={[{
            key: 'summer/photo.jpg',
            size: 1024,
            lastModified: '2026-07-20T12:00:00Z',
            contentType: 'image/jpeg',
          }]}
          currentPath=""
          searchQuery=""
          filterQuery=""
          deepSearch={false}
          selectedFileKeys={new Set()}
          selectedFolderKeys={new Set()}
          isDragActive={false}
          itemsPerPage={25}
          onNavigateToFolder={vi.fn()}
          onToggleFileSelection={vi.fn()}
          onToggleFolderSelection={vi.fn()}
          onSelectAll={vi.fn()}
          onPageChange={vi.fn()}
          onItemsPerPageChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', {name: 'Copy public URL for summer/photo.jpg'}));
    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith('https://cdn.example.com/summer/photo.jpg');
    });

    fireEvent.click(screen.getByRole('button', {name: 'Actions for summer/photo.jpg'}));
    expect(screen.queryByText('Copy public URL')).not.toBeInTheDocument();
  });
});
