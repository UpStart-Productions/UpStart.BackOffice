/** Per-user hidden pipeline lanes on the board (localStorage). */

const STORAGE_PREFIX = 'pipeline-hidden-lanes';
const VERSION = 1;

function storageKey(userId: string, pipelineId: string): string {
  return `${STORAGE_PREFIX}:v${VERSION}:${userId}:${pipelineId}`;
}

export function loadHiddenLaneIds(userId: string | null | undefined, pipelineId: string | null | undefined): Set<string> {
  if (!userId || !pipelineId || typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(storageKey(userId, pipelineId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as { laneIds?: unknown };
    if (!Array.isArray(parsed.laneIds)) return new Set();
    return new Set(parsed.laneIds.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

export function saveHiddenLaneIds(
  userId: string | null | undefined,
  pipelineId: string | null | undefined,
  laneIds: Iterable<string>,
): void {
  if (!userId || !pipelineId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId, pipelineId), JSON.stringify({ v: VERSION, laneIds: [...laneIds] }));
  } catch {
    /* private mode / quota */
  }
}
