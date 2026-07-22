import type { BreadcrumbItem } from '@/components/ui/breadcrumb';

function decodePathPart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function directoryCrumbs(
  parts: string[],
  objectsPath: string,
): BreadcrumbItem[] {
  return parts.map((label, index) => {
    const prefix = `${parts.slice(0, index + 1).join('/')}/`;
    return {
      label,
      to: `${objectsPath}?prefix=${encodeURIComponent(prefix)}`,
    };
  });
}

export function buildAppBreadcrumbs(pathname: string, search = ''): BreadcrumbItem[] {
  if (pathname === '/') return [{ label: 'Dashboard' }];
  if (pathname === '/cluster') return [{ label: 'Cluster' }];
  if (pathname === '/access') return [{ label: 'Access Control' }];
  if (pathname === '/buckets') return [{ label: 'Buckets' }];

  const pathParts = pathname.split('/').filter(Boolean);
  if (pathParts[0] !== 'buckets' || !pathParts[1]) return [];

  const encodedBucketName = pathParts[1];
  const bucketName = decodePathPart(encodedBucketName);
  const bucketPath = `/buckets/${encodedBucketName}`;
  const objectsPath = `${bucketPath}/objects`;
  const crumbs: BreadcrumbItem[] = [
    { label: 'Buckets', to: '/buckets' },
    { label: bucketName, to: objectsPath },
  ];
  const section = pathParts[2];

  if (section === 'objects') {
    crumbs.push({ label: 'Objects', to: objectsPath });

    const encodedObjectKey = pathParts.slice(3).join('/');
    if (encodedObjectKey) {
      const objectParts = decodePathPart(encodedObjectKey).split('/').filter(Boolean);
      const fileName = objectParts.pop();
      crumbs.push(...directoryCrumbs(objectParts, objectsPath));
      if (fileName) crumbs.push({ label: fileName });
      return crumbs;
    }

    const prefix = new URLSearchParams(search).get('prefix') ?? '';
    crumbs.push(...directoryCrumbs(prefix.split('/').filter(Boolean), objectsPath));
    return crumbs;
  }

  if (section) {
    const label = decodePathPart(section);
    crumbs.push({ label: label[0].toUpperCase() + label.slice(1) });
  }
  return crumbs;
}
