export class ServerUrlError extends Error {}

export function normalizeServerUrl(input: string, allowDebugHttp = false): string {
  const candidate = input.trim();
  if (!candidate) {
    throw new ServerUrlError('Enter a server URL.');
  }

  let url: URL;
  try {
    url = new URL(candidate.includes('://') ? candidate : `https://${candidate}`);
  } catch {
    throw new ServerUrlError('Enter a valid server URL.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new ServerUrlError('The server URL cannot include credentials, query parameters, or a fragment.');
  }
  if (
    url.protocol !== 'https:' &&
    !(allowDebugHttp && url.protocol === 'http:' && isLocalNetworkHost(url.hostname))
  ) {
    throw new ServerUrlError('HTTPS is required.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new ServerUrlError('Use the Garage UI origin without an API path.');
  }

  url.pathname = '';
  return url.toString().replace(/\/$/, '');
}

function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return true;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:') || host === '::1') {
    return true;
  }

  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}
