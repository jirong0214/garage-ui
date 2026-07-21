import { describe, expect, it } from 'vitest';
import { buildAppBreadcrumbs } from './breadcrumbs';

describe('buildAppBreadcrumbs', () => {
  it('includes the current object and clickable parent directories', () => {
    expect(buildAppBreadcrumbs('/buckets/default-bucket/objects/photos%2F2026%2Fimage.png')).toEqual([
      {label: 'Buckets', to: '/buckets'},
      {label: 'default-bucket', to: '/buckets/default-bucket/objects'},
      {label: 'Objects', to: '/buckets/default-bucket/objects'},
      {label: 'photos', to: '/buckets/default-bucket/objects?prefix=photos%2F'},
      {label: '2026', to: '/buckets/default-bucket/objects?prefix=photos%2F2026%2F'},
      {label: 'image.png'},
    ]);
  });

  it('uses the prefix query parameter for object browser directories', () => {
    expect(buildAppBreadcrumbs(
      '/buckets/default-bucket/objects',
      '?prefix=photos%2F2026%2F',
    )).toEqual([
      {label: 'Buckets', to: '/buckets'},
      {label: 'default-bucket', to: '/buckets/default-bucket/objects'},
      {label: 'Objects', to: '/buckets/default-bucket/objects'},
      {label: 'photos', to: '/buckets/default-bucket/objects?prefix=photos%2F'},
      {label: '2026', to: '/buckets/default-bucket/objects?prefix=photos%2F2026%2F'},
    ]);
  });

  it('decodes bucket names while retaining encoded links', () => {
    expect(buildAppBreadcrumbs('/buckets/team%20photos/settings')).toEqual([
      {label: 'Buckets', to: '/buckets'},
      {label: 'team photos', to: '/buckets/team%20photos/objects'},
      {label: 'Settings'},
    ]);
  });
});
