/**
 * The admin NOTE editor (ngx-quill) renders artifact.content as raw HTML
 * via [innerHTML] with the ql-editor class — it does NOT parse Quill Delta
 * JSON. Convert plain-text notes into Quill-compatible HTML:
 * blank-line-separated blocks become <p> paragraphs, single newlines
 * within a block become <br>.
 */
export function plainTextToQuillHtml(text: string): string {
  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
