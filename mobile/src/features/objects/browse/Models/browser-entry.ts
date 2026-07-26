export type BrowserEntry = {
  id: string;
  key: string;
  name: string;
  folder: boolean;
  size: number;
  modifiedAt: string | null;
  contentType?: string;
  etag?: string;
};

export type BrowserObject = {
  key?: string;
  size?: number;
  last_modified?: string;
  content_type?: string;
  etag?: string;
};
