import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { InjectionToken, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DEFAULT_LUCIDE_ASSET_BASE, LucideIconIndexEntry } from './types';

/** Base path the sprite/index are served from. Defaults to "/lucide" (admin's public/lucide/ folder).
 *  Override with a DI provider if a consuming app serves the generated assets somewhere else. */
export const LUCIDE_ICON_ASSET_BASE = new InjectionToken<string>('LUCIDE_ICON_ASSET_BASE', {
  providedIn: 'root',
  factory: () => DEFAULT_LUCIDE_ASSET_BASE,
});

const SPRITE_HOST_ID = 'nmp-lucide-sprite-host';

/**
 * Owns the two generated Lucide assets (sprite.svg, icons-index.json) and loads both lazily:
 * nothing is fetched until the first `<nmp-lucide-icon>` renders or the picker is opened for the
 * first time. Both fetches are de-duped behind a shared promise so many components mounting at
 * once still only trigger one network request each.
 *
 * The sprite's <symbol> definitions get inlined into an off-screen host appended to <body> (once),
 * so every `<use href="#name">` in the app — including inside innerHTML-injected Quill content — is
 * a same-document fragment reference. Cross-document `<use href="sprite.svg#name">` is unreliable in
 * mobile WebViews and inside innerHTML'd markup, so we deliberately don't rely on it.
 */
@Injectable({ providedIn: 'root' })
export class LucideIconRegistryService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly assetBase = inject(LUCIDE_ICON_ASSET_BASE);

  private spritePromise: Promise<void> | null = null;
  private indexPromise: Promise<LucideIconIndexEntry[]> | null = null;

  ensureSpriteLoaded(): Promise<void> {
    if (this.spritePromise) return this.spritePromise;

    if (this.document.getElementById(SPRITE_HOST_ID)) {
      this.spritePromise = Promise.resolve();
      return this.spritePromise;
    }

    this.spritePromise = firstValueFrom(
      this.http.get(`${this.assetBase}/lucide-sprite.svg`, { responseType: 'text' }),
    ).then((svgText) => {
      // Guard again in case two callers raced past the getElementById check above.
      if (this.document.getElementById(SPRITE_HOST_ID)) return;
      const host = this.document.createElement('div');
      host.id = SPRITE_HOST_ID;
      host.setAttribute('aria-hidden', 'true');
      host.style.position = 'absolute';
      host.style.width = '0';
      host.style.height = '0';
      host.style.overflow = 'hidden';
      host.innerHTML = svgText;
      this.document.body.appendChild(host);
    });

    return this.spritePromise;
  }

  /** Loads the generated {name, tags}[] index once. Never called per-keystroke — search() below
   *  filters the already-resolved in-memory array. */
  loadIndex(): Promise<LucideIconIndexEntry[]> {
    if (!this.indexPromise) {
      this.indexPromise = firstValueFrom(
        this.http.get<LucideIconIndexEntry[]>(`${this.assetBase}/lucide-icons-index.json`),
      );
    }
    return this.indexPromise;
  }

  /** Case-insensitive substring match against name + tags. Empty query returns the full index —
   *  callers are expected to render results through a virtualized viewport, not all at once. */
  async search(query: string): Promise<LucideIconIndexEntry[]> {
    const index = await this.loadIndex();
    const q = query.trim().toLowerCase();
    if (!q) return index;
    return index.filter(
      (entry) => entry.name.includes(q) || entry.tags.some((tag) => tag.includes(q)),
    );
  }
}
