import { preparePersonCardNotesHtml } from './quill-person-card-render';
import { quillHtmlToBreakable } from './quill-utils';

/** True when a Quill/HTML value has no visible text. */
export function isEmptyRichText(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  if (/bo-person-card|ql-person-card|ql-content-file|<img\b/i.test(value)) return false;
  const text = quillHtmlToBreakable(value)
    .replace(/<[^>]*>/g, '')
    .trim();
  return text.length === 0;
}

/** Return trimmed HTML, or undefined when the editor is effectively empty. */
export function richTextOrUndefined(value: string | null | undefined): string | undefined {
  if (isEmptyRichText(value)) return undefined;
  const html = value as string;
  return quillHtmlToBreakable(preparePersonCardNotesHtml(html)).trim();
}
