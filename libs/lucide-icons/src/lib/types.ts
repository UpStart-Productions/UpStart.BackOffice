/** One entry in the generated icon search index. */
export interface LucideIconIndexEntry {
  /** Canonical Lucide icon name, e.g. "house", "hand-helping". Matches a <symbol id> in the sprite. */
  name: string;
  /** Search keywords from Lucide's own tag metadata (may be empty). */
  tags: string[];
}

/** Where the generated sprite/index are served from at runtime. Override via LUCIDE_ICON_ASSET_BASE if needed. */
export const DEFAULT_LUCIDE_ASSET_BASE = '/lucide';
