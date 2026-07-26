export class ApiCompatibilityError extends Error {}

export function assertCompatibleApiVersion(
  apiVersion: string | undefined,
  allowUnknownDebugContract: boolean,
): void {
  if (!apiVersion) {
    if (allowUnknownDebugContract) return;
    throw new ApiCompatibilityError('This server does not report a compatible mobile API version.');
  }

  const major = Number(apiVersion.split('.')[0]);
  if (!Number.isInteger(major) || major !== 1) {
    throw new ApiCompatibilityError(`Mobile API ${apiVersion} is not supported by this app.`);
  }
}
