import type {
  ModelsCreateObjectJobRequest,
  ModelsObjectJob,
  ModelsObjectJobFailure,
  ModelsObjectJobFailureList,
} from '@garage-ui/api-client';

export type ObjectJobOperation = NonNullable<ModelsObjectJob['operation']>;
export type ObjectJobStatus = NonNullable<ModelsObjectJob['status']>;
export type CreateObjectJobRequest = ModelsCreateObjectJobRequest;
export type ObjectJob = ModelsObjectJob;
export type ObjectJobFailure = ModelsObjectJobFailure;
export type ObjectJobFailureList = ModelsObjectJobFailureList;

const activeStatuses: ReadonlySet<ObjectJobStatus> = new Set([
  'queued',
  'scanning',
  'running',
  'cancelling',
]);

export function isObjectJobActive(job: ObjectJob): boolean {
  return Boolean(job.status && activeStatuses.has(job.status));
}

export function objectJobCanCancel(job: ObjectJob): boolean {
  return job.status === 'queued' || job.status === 'scanning' || job.status === 'running';
}
