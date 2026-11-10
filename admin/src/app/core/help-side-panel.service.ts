import { inject, Injectable, signal } from '@angular/core';
import { SessionService } from './session.service';

export type HelpSidePanelMode = 'article' | 'guide';

const PANEL_STORAGE_PREFIX = 'ubo-help-side-panel-';

/**
 * One right-hand panel for page help (?) and the Back Office guide (avatar).
 * Only one mode is visible at a time; opening either entry sets `open` and the mode.
 */
@Injectable({ providedIn: 'root' })
export class HelpSidePanelService {
  private readonly session = inject(SessionService);

  readonly open = signal(false);
  readonly mode = signal<HelpSidePanelMode>('article');
  /** Lazy-mount the panel after the first open (either mode). */
  readonly mountPanel = signal(false);
  /** Set by the guide FAB after /help-agent/status — controls the Ask tab and FAB. */
  readonly guideConfigured = signal(false);

  openArticle(): void {
    this.mountPanel.set(true);
    this.mode.set('article');
    this.open.set(true);
    this.persist();
  }

  openGuide(): void {
    if (!this.guideConfigured()) return;
    this.mountPanel.set(true);
    this.mode.set('guide');
    this.open.set(true);
    this.persist();
  }

  close(): void {
    this.open.set(false);
    this.persist();
  }

  setMode(mode: HelpSidePanelMode): void {
    if (mode === 'guide' && !this.guideConfigured()) return;
    this.mountPanel.set(true);
    this.mode.set(mode);
    this.open.set(true);
    this.persist();
  }

  /** Top bar ? — close if already showing this page's article; otherwise open article mode. */
  toggleArticle(): void {
    if (this.open() && this.mode() === 'article') {
      this.close();
      return;
    }
    this.openArticle();
  }

  /** Avatar — close if guide is already showing; otherwise open guide mode. */
  toggleGuide(): void {
    if (!this.guideConfigured()) return;
    if (this.open() && this.mode() === 'guide') {
      this.close();
      return;
    }
    this.openGuide();
  }

  /** Call after session is ready (e.g. Shell ngOnInit). */
  restoreFromStorage(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw) as { open?: boolean; mode?: HelpSidePanelMode };
      if (!data.open) return;
      this.mountPanel.set(true);
      this.mode.set(data.mode === 'guide' ? 'guide' : 'article');
      this.open.set(true);
    } catch {
      /* ignore */
    }
  }

  private storageKey(): string | null {
    const id = this.session.me()?.id;
    return id ? `${PANEL_STORAGE_PREFIX}${id}` : null;
  }

  private persist(): void {
    const key = this.storageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ open: this.open(), mode: this.mode() }));
    } catch {
      /* quota / private mode */
    }
  }
}
