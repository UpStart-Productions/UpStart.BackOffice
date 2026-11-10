/** Per-user pipeline board view preferences (localStorage). */

const HIDDEN_LANES_PREFIX = 'pipeline-hidden-lanes';
const SELECTED_PIPELINE_PREFIX = 'pipeline-selected';
const VERSION = 1;

function hiddenLanesKey(userId: string, pipelineId: string): string {
  return `${HIDDEN_LANES_PREFIX}:v${VERSION}:${userId}:${pipelineId}`;
}

function selectedPipelineKey(userId: string): string {
  return `${SELECTED_PIPELINE_PREFIX}:v${VERSION}:${userId}`;
}

export function loadSelectedPipelineId(userId: string | null | undefined): string | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(selectedPipelineKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pipelineId?: unknown };
    return typeof parsed.pipelineId === 'string' && parsed.pipelineId.length > 0 ? parsed.pipelineId : null;
  } catch {
    return null;
  }
}

export function saveSelectedPipelineId(userId: string | null | undefined, pipelineId: string | null | undefined): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    if (!pipelineId) {
      localStorage.removeItem(selectedPipelineKey(userId));
      return;
    }
    localStorage.setItem(selectedPipelineKey(userId), JSON.stringify({ v: VERSION, pipelineId }));
  } catch {
    /* private mode / quota */
  }
}

export function loadHiddenLaneIds(userId: string | null | undefined, pipelineId: string | null | undefined): Set<string> {
  if (!userId || !pipelineId || typeof localStorage === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(hiddenLanesKey(userId, pipelineId));
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
    localStorage.setItem(hiddenLanesKey(userId, pipelineId), JSON.stringify({ v: VERSION, laneIds: [...laneIds] }));
  } catch {
    /* private mode / quota */
  }
}
