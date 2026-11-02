import { signal } from '@angular/core';

export type AutoSaveState = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Auto-save for forms: collects changed answers and saves only those, a moment after the last change (or right away
 * with `now`). Several people can work on the same form: each save sends just what this person changed. A failed save
 * keeps the changes and retries with a growing delay until it works. Pages show `state` with app-save-status.
 */
export class AutoSaver<V = unknown> {
  readonly state = signal<AutoSaveState>('idle');
  readonly lastSavedAt = signal<Date | null>(null);
  private pending = new Map<string, V>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private retryMs = 2000;

  constructor(
    private readonly save: (changes: Record<string, V>) => Promise<void>,
    private readonly delayMs = 800,
  ) {}

  /** An answer changed. `now`: a pick, checkbox or file (no typing to wait for). */
  change(key: string, value: V, now = false) {
    this.pending.set(key, value);
    this.schedule(now ? 0 : this.delayMs);
  }

  /** Whether anything is waiting to be saved (or being saved). */
  get busy(): boolean {
    return this.pending.size > 0 || !!this.inFlight;
  }

  /** Save everything now and wait (before Submit, End visit, leaving the page). Throws if it can't save. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight.catch(() => undefined);
    if (this.pending.size) await this.run(true);
  }

  /** Stop timers (page closing). */
  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(false), ms);
  }

  private async run(throwOnError: boolean): Promise<void> {
    this.timer = null;
    if (this.inFlight) {
      // A save is running: go again once it's done.
      await this.inFlight.catch(() => undefined);
      if (!this.pending.size) return;
    }
    const batch = Object.fromEntries(this.pending);
    this.pending.clear();
    this.state.set('saving');
    this.inFlight = this.save(batch);
    try {
      await this.inFlight;
      this.retryMs = 2000;
      this.lastSavedAt.set(new Date());
      this.state.set(this.pending.size ? 'saving' : 'saved');
      if (this.pending.size) this.schedule(0);
    } catch (err) {
      // Put the failed changes back (newer edits win) and try again later.
      for (const [k, v] of Object.entries(batch)) if (!this.pending.has(k)) this.pending.set(k, v);
      this.state.set('error');
      this.schedule(this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 30000);
      if (throwOnError) throw err;
    } finally {
      this.inFlight = null;
    }
  }
}
