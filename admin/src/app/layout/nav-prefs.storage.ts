/** Per-user main navigation preferences (localStorage). */

const STORAGE_KEY_PREFIX = 'ubo-nav-prefs:v1';

export type NavPrefs = {
  /** Main sidebar hidden (desktop slide-away). */
  hidden?: boolean;
  /** Icon rail instead of full labels (non–Task Manager routes). */
  compact?: boolean;
  /** Full main nav labels on Task Manager routes (default is icon rail). */
  tasksNavExpanded?: boolean;
  /** Section labels (CRM, Office, …) the user collapsed. */
  collapsedSections?: string[];
};

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}:${userId}`;
}

export function readNavPrefs(userId: string | null | undefined): NavPrefs {
  if (!userId || typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as NavPrefs;
    const out: NavPrefs = {};
    if (typeof parsed.hidden === 'boolean') out.hidden = parsed.hidden;
    if (typeof parsed.compact === 'boolean') out.compact = parsed.compact;
    if (typeof parsed.tasksNavExpanded === 'boolean') out.tasksNavExpanded = parsed.tasksNavExpanded;
    if (Array.isArray(parsed.collapsedSections)) {
      out.collapsedSections = parsed.collapsedSections.filter((x): x is string => typeof x === 'string' && x.length > 0);
    }
    return out;
  } catch {
    return {};
  }
}

export function writeNavPrefs(userId: string | null | undefined, patch: NavPrefs): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    const prev = readNavPrefs(userId);
    const next: NavPrefs = { ...prev, ...patch };
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Prefs just won't persist.
  }
}
