export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope = {
  error?: { code?: string; message?: string };
  message?: string;
};

export function toApiError(error: unknown, response?: Response): ApiError {
  if (error instanceof ApiError) return error;
  const envelope = error && typeof error === 'object' ? (error as ApiEnvelope) : undefined;
  const message =
    envelope?.error?.message ??
    envelope?.message ??
    (error instanceof Error ? error.message : 'The request could not be completed.');
  return new ApiError(
    message,
    response?.status,
    envelope?.error?.code,
    response?.headers.get('x-request-id') ?? undefined,
  );
}
