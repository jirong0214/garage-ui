import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, describe, expect, it, vi} from 'vitest';
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
  beforeEach(() => {
    localStorage.clear();
  });

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

  it('restores the selected sort column and direction from local storage', () => {
    const props = {
      bucketName: 'photos',
      canShare: false,
      objects: [
        {key: 'older.jpg', size: 100, lastModified: '2026-07-18T12:00:00Z', contentType: 'image/jpeg'},
        {key: 'newer.jpg', size: 200, lastModified: '2026-07-20T12:00:00Z', contentType: 'image/jpeg'},
      ],
      currentPath: '',
      searchQuery: '',
      filterQuery: '',
      deepSearch: false,
      selectedFileKeys: new Set<string>(),
      selectedFolderKeys: new Set<string>(),
      isDragActive: false,
      itemsPerPage: 25,
      onNavigateToFolder: vi.fn(),
      onToggleFileSelection: vi.fn(),
      onToggleFolderSelection: vi.fn(),
      onSelectAll: vi.fn(),
      onPageChange: vi.fn(),
      onItemsPerPageChange: vi.fn(),
    };

    const firstRender = render(
      <MemoryRouter>
        <ObjectsTable {...props} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Modified'));
    fireEvent.click(screen.getByText('Modified ↑'));
    expect(localStorage.getItem('garage-ui:objects-sort')).toBe('{"column":"modified","direction":"desc"}');
    firstRender.unmount();

    render(
      <MemoryRouter>
        <ObjectsTable {...props} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Modified ↓')).toBeInTheDocument();
    const objectButtons = screen.getAllByRole('button').filter((button) =>
      button.textContent === 'newer.jpg' || button.textContent === 'older.jpg',
    );
    expect(objectButtons.map((button) => button.textContent)).toEqual(['newer.jpg', 'older.jpg']);
  });
});
