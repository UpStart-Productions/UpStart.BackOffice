/**
 * Compares pipeline and lane names the way a person reads them: emoji, punctuation, extra spaces
 * and letter case are ignored, so "👏 Checkout started" matches "Checkout started".
 */
export function laneNameKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** The first item whose name matches `name` by laneNameKey, if any. */
export function findByLaneName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const key = laneNameKey(name);
  return key ? items.find((i) => laneNameKey(i.name) === key) : undefined;
}
