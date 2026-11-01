import { htmlToPlainText } from '../task-manager/task-mentions.util';

/** A description written in the editor is HTML: plain text for embeds and HTML for UBO pages. */
export function descriptionParts(description: string | null): { description: string | null; descriptionHtml: string | null } {
  if (!description?.trim()) return { description: null, descriptionHtml: null };
  if (!/^\s*</.test(description)) return { description, descriptionHtml: null };
  return { description: htmlToPlainText(description, 10000) || null, descriptionHtml: description };
}
