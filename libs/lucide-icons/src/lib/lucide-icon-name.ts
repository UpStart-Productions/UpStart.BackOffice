/**
 * Name helpers kept separate from `lucide-icon-markup.ts` so they don't pull the ~390 KB generated
 * path table into whatever bundle imports them (Back Office: keeps it out of the initial chunk).
 */
export const DEFAULT_LUCIDE_ICON_NAME = 'circle-dashed';

/** Normalize a Lucide icon name to lower-kebab-case safe for storage and lookup. */
export function normalizeLucideIconName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || DEFAULT_LUCIDE_ICON_NAME;
}

/** Read the Lucide icon name back out of stored inline markup (standalone column or Quill embed). */
export function parseLucideIconNameFromMarkup(
  markup: string | null | undefined,
): string | null {
  if (!markup?.trim()) return null;
  const match = markup.match(/\bdata-icon="([a-z0-9-]+)"/);
  return match?.[1] ?? null;
}
