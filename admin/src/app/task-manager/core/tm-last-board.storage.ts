/** Last Task Manager project board the user opened (per user, localStorage). */

const STORAGE_PREFIX = 'tm-last-board';
const VERSION = 1;

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:v${VERSION}:${userId}`;
}

export function loadTmLastBoard(userId: string | null | undefined): string | null {
  if (!userId || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { projectId?: unknown };
    return typeof parsed.projectId === 'string' && parsed.projectId.length > 0 ? parsed.projectId : null;
  } catch {
    return null;
  }
}

export function saveTmLastBoard(userId: string | null | undefined, projectId: string): void {
  if (!userId || !projectId || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify({ v: VERSION, projectId }));
  } catch {
    /* private mode / quota */
  }
}
