/** Parse filename from a Content-Disposition header (filename or filename*). */
export function filenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header?.trim()) return null;
  const star = /filename\*=UTF-8''([^;\s]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]).trim() || null;
    } catch {
      /* fall through */
    }
  }
  const quoted = /filename="([^"]+)"/i.exec(header);
  if (quoted?.[1]) return quoted[1].trim() || null;
  const plain = /filename=([^;\s]+)/i.exec(header);
  if (plain?.[1]) return plain[1].replace(/^["']|["']$/g, '').trim() || null;
  return null;
}

/** Resolve display name for GET /api/uploads/… when the API did not send one in the payload. */
export async function fetchUploadDisplayName(resolvedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(resolvedUrl, { method: 'HEAD' });
    if (!res.ok) return null;
    return filenameFromContentDisposition(res.headers.get('Content-Disposition'));
  } catch {
    return null;
  }
}
