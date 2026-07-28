/** True when a Quill/HTML value has no visible text. */
export function isEmptyRichText(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  const text = value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
  return text.length === 0;
}

/** Return trimmed HTML, or undefined when the editor is effectively empty. */
export function richTextOrUndefined(value: string | null | undefined): string | undefined {
  if (isEmptyRichText(value)) return undefined;
  return value!.trim();
}
