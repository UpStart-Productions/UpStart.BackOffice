/** File cards (Files tab, task attachments): which icon and label a file gets, and whether it previews as an image. */

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const RASTER_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm']);

export function fileExtension(name: string | null | undefined): string {
  const base = (name ?? '').split('?')[0] ?? '';
  return base.includes('.') ? base.split('.').pop()!.toLowerCase() : '';
}

/** Short type label for a card, e.g. PDF, DOCX. */
export function fileExtLabel(name: string | null | undefined): string {
  return fileExtension(name).toUpperCase().slice(0, 4);
}

export function isRasterImage(name: string | null | undefined, mime: string | null | undefined): boolean {
  const m = mime ?? '';
  if (m === 'image/svg+xml') return false;
  if (m && IMAGE_MIME_TYPES.has(m)) return true;
  return RASTER_EXTENSIONS.has(fileExtension(name));
}

export function isPdfFile(name: string | null | undefined, mime: string | null | undefined): boolean {
  return mime === 'application/pdf' || fileExtension(name) === 'pdf';
}

/** MP4, MOV, M4V or WebM: previews as its first frame and plays in the browser. */
export function isVideoFile(name: string | null | undefined, mime: string | null | undefined): boolean {
  return (mime ?? '').startsWith('video/') || VIDEO_EXTENSIONS.has(fileExtension(name));
}

/** PrimeIcons class for a file, e.g. pi-file-pdf. */
export function fileIconClass(name: string | null | undefined, mime: string | null | undefined): string {
  const m = mime ?? '';
  const ext = fileExtension(name);
  if (m === 'application/pdf' || ext === 'pdf') return 'pi-file-pdf';
  if (m === 'application/msword' || m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'doc' || ext === 'docx') {
    return 'pi-file-word';
  }
  if (m === 'application/vnd.ms-excel' || m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xls' || ext === 'xlsx') {
    return 'pi-file-excel';
  }
  if (m === 'text/plain' || ext === 'txt') return 'pi-file';
  if (m === 'image/svg+xml' || ext === 'svg') return 'pi-image';
  if (m.startsWith('video/')) return 'pi-video';
  if (m.startsWith('audio/')) return 'pi-volume-up';
  return 'pi-file';
}
