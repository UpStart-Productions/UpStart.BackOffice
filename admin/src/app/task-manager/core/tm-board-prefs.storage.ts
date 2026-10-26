/** Per-user project board UI preferences (localStorage). */

export type TmProjectBoardCompletedFilter = 'incomplete' | 'all' | 'completed';

export type TmProjectBoardPrefs = {
  completedFilter?: TmProjectBoardCompletedFilter;
  tagFilter?: string[];
  /** Section IDs the user has collapsed (view-only; not shared on the project). */
  collapsedSectionIds?: string[];
};

const STORAGE_PREFIX = 'tm-board-prefs';
const VERSION = 1;

type Stored = TmProjectBoardPrefs & { v?: number };

function storageKey(userId: string, projectId: string): string {
  return `${STORAGE_PREFIX}:v${VERSION}:${userId}:${projectId}`;
}

function isCompletedFilter(value: unknown): value is TmProjectBoardCompletedFilter {
  return value === 'incomplete' || value === 'all' || value === 'completed';
}

export function loadTmProjectBoardPrefs(
  userId: string | undefined | null,
  projectId: string,
): TmProjectBoardPrefs | null {
  if (!userId || !projectId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const out: TmProjectBoardPrefs = {};
    if (isCompletedFilter(parsed.completedFilter)) {
      out.completedFilter = parsed.completedFilter;
    }
    if (Array.isArray(parsed.tagFilter)) {
      out.tagFilter = parsed.tagFilter.filter((id): id is string => typeof id === 'string');
    }
    if (Array.isArray(parsed.collapsedSectionIds)) {
      out.collapsedSectionIds = parsed.collapsedSectionIds.filter(
        (id): id is string => typeof id === 'string',
      );
    }
    return out;
  } catch {
    return null;
  }
}

export function saveTmProjectBoardPrefs(
  userId: string | undefined | null,
  projectId: string,
  prefs: TmProjectBoardPrefs,
): void {
  if (!userId || !projectId) return;
  try {
    const payload: Stored = {
      v: VERSION,
      completedFilter: prefs.completedFilter,
      tagFilter: prefs.tagFilter,
      collapsedSectionIds: prefs.collapsedSectionIds,
    };
    localStorage.setItem(storageKey(userId, projectId), JSON.stringify(payload));
  } catch {
    /* private mode / quota — prefs stay session-only */
  }
}
