/** Parse quill-mention blots from Quill HTML (ported from KC.SPP.WebApp in-app-notifications lib). */
const MENTION_OPEN_TAG = /<span\b[^>]*\bclass="[^"]*\bmention\b[^"]*"([^>]*)>/gi;

function readDataAttr(attrs: string, name: string): string | null {
  const match = attrs.match(new RegExp(`\\bdata-${name}="([^"]+)"`, 'i'));
  return match?.[1]?.trim() ?? null;
}

export function extractMentionedUserIds(html: string | null | undefined): string[] {
  if (!html?.trim()) return [];
  const ids = new Set<string>();
  for (const match of html.matchAll(MENTION_OPEN_TAG)) {
    const attrs = match[1] ?? '';
    const type = readDataAttr(attrs, 'mention-type') ?? 'user';
    if (type !== 'user') continue;
    const id = readDataAttr(attrs, 'id');
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Plain-text preview of Quill HTML for notification bodies / emails. */
export function htmlToPlainText(html: string | null | undefined, maxLength = 280): string {
  if (!html) return '';
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}
