import { FALLBACK_LUCIDE_ICON, LUCIDE_ICON_PATHS } from './lucide-icon-paths.generated';
import { normalizeLucideIconName } from './lucide-icon-name';

export { normalizeLucideIconName, parseLucideIconNameFromMarkup } from './lucide-icon-name';

/** Inner SVG markup (paths/groups) for a Lucide icon name. */
export function getLucideIconPathsInner(name: string): string {
  const normalized = normalizeLucideIconName(name);
  return LUCIDE_ICON_PATHS[normalized] ?? LUCIDE_ICON_PATHS[FALLBACK_LUCIDE_ICON] ?? '';
}

/**
 * Self-contained inline Lucide icon HTML for DB storage and mobile innerHTML rendering.
 * Includes `data-icon` for debugging and re-editing in admin pickers.
 */
export function buildLucideIconMarkup(
  name: string,
  options?: { contenteditable?: boolean },
): string {
  const normalized = normalizeLucideIconName(name);
  const inner = getLucideIconPathsInner(normalized);
  const contenteditable =
    options?.contenteditable === false ? ' contenteditable="false"' : '';
  return (
    `<span class="ql-lucide-icon" data-icon="${normalized}"${contenteditable}>` +
    `<svg class="lucide-inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
    `${inner}</svg></span>`
  );
}
