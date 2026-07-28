export type UploadCandidate = {
  id: string;
  sourceUri: string;
  fileName: string;
  contentType: string;
  size: number | null;
};

export type PendingUpload = UploadCandidate & {
  objectName: string;
};
