// The only URL shape the client sees for a generated file. It redirects to a
// short-lived signed URL after an org check.
export function createDownloadUrlPath(renderId: string): string {
  return `/api/renders/${renderId}`;
}
