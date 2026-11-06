/** RFC 5987 `filename*` for Content-Disposition (UTF-8). */
export function contentDispositionFilename(filename: string, inline: boolean): string {
  const mode = inline ? 'inline' : 'attachment';
  const safe = filename.replace(/[\r\n"]/g, '').trim() || 'download';
  return `${mode}; filename="${safe.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
