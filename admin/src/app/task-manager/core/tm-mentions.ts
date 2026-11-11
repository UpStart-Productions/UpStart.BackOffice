/** True when Quill HTML has no visible content. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  if (/<img\b|class="mention"|bo-person-card|ql-person-card|ql-content-file/i.test(html)) return false;
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length === 0;
}
