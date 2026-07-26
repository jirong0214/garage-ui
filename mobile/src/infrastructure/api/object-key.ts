export function objectKeyQuery(key: string): string {
  const parameters = new URLSearchParams();
  parameters.set('key', key);
  return parameters.toString();
}
