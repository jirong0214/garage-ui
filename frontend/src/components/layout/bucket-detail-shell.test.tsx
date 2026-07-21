import {render, screen} from '@testing-library/react';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import {describe, expect, it, vi} from 'vitest';
import {BucketDetailShell} from './bucket-detail-shell';

vi.mock('@/hooks/useApi', () => ({
  useBuckets: () => ({
    data: [{name: 'default-bucket', objectCount: 12, size: 2048}],
  }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  useBucketCan: () => () => true,
}));

function renderShell(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/buckets/:bucketName" element={<BucketDetailShell />}>
          <Route path="objects" element={<div>Objects content</div>} />
          <Route path="permissions" element={<div>Permissions content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('BucketDetailShell', () => {
  it('shows a compact summary and upload action on the Objects tab', () => {
    renderShell('/buckets/default-bucket/objects');

    expect(screen.getByText('s3://default-bucket')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Copy bucket URL'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Upload'})).toBeInTheDocument();
    expect(screen.queryByRole('heading', {name: 'default-bucket'})).not.toBeInTheDocument();
  });

  it('hides upload outside the Objects tab', () => {
    renderShell('/buckets/default-bucket/permissions');

    expect(screen.queryByRole('button', {name: 'Upload'})).not.toBeInTheDocument();
  });
});
