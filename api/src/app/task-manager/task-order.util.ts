/** Fractional ordering for drag-and-drop lists (sections, tasks). */
export const ORDER_STEP = 1024;

/**
 * Sort order for an item dropped between `before` and `after` (either may be null = list edge).
 * Returns null when the gap is exhausted and the list should be renumbered.
 */
export function orderBetween(before: number | null, after: number | null): number | null {
  if (before == null && after == null) return ORDER_STEP;
  if (before == null) return (after as number) - ORDER_STEP;
  if (after == null) return before + ORDER_STEP;
  const mid = (before + after) / 2;
  if (!(mid > before && mid < after) || after - before < 1e-6) return null;
  return mid;
}

/** Evenly renumber a list (used when fractional gaps run out). */
export function renumber<T extends { id: string }>(items: T[]): { id: string; sortOrder: number }[] {
  return items.map((item, index) => ({ id: item.id, sortOrder: (index + 1) * ORDER_STEP }));
}
