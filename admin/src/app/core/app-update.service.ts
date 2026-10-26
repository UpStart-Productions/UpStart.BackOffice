import { inject, Injectable, Injector } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { filter } from 'rxjs';

const TOAST_FLAG = 'ubo_app_update_toast';
const RELOAD_ATTEMPT_AT = 'ubo_app_update_attempt_at';
const BUILD_FINGERPRINT = 'ubo_app_build_fingerprint';

/** Min ms between auto-reloads so a broken deploy cannot loop forever. */
const RELOAD_COOLDOWN_MS = 45_000;

/**
 * After deploy, long-lived tabs keep old JS and lazy routes 404. Reload once and explain on the next load.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly injector = inject(Injector);
  private installed = false;

  private get enabled(): boolean {
    return typeof ngDevMode === 'undefined' ? true : !ngDevMode;
  }

  install(): void {
    if (this.installed || !this.enabled) return;
    this.installed = true;

    this.rememberCurrentBuildFingerprint();

    window.addEventListener('unhandledrejection', (event) => {
      if (this.isStaleChunkFailure(event.reason)) {
        event.preventDefault();
        this.reloadForUpdate();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.checkForRemoteUpdate();
    });

    queueMicrotask(() => {
      const router = this.injector.get(Router);
      router.events.pipe(filter((e): e is NavigationError => e instanceof NavigationError)).subscribe((event) => {
        if (this.isStaleChunkFailure(event.error)) {
          this.reloadForUpdate();
        }
      });
    });
  }

  /** PrimeNG toast once after an update-driven reload. Call from shell after layout is up. */
  showPostReloadToast(): void {
    try {
      if (sessionStorage.getItem(TOAST_FLAG) !== '1') return;
      sessionStorage.removeItem(TOAST_FLAG);
      sessionStorage.removeItem(RELOAD_ATTEMPT_AT);
      this.injector.get(MessageService).add({
        severity: 'info',
        summary: 'Updated',
        detail: "Back Office was updated. You're on the latest version.",
        life: 7000,
      });
    } catch {
      /* storage blocked */
    }
  }

  private rememberCurrentBuildFingerprint(): void {
    try {
      const fp = this.fingerprintFromDocument();
      if (fp) sessionStorage.setItem(BUILD_FINGERPRINT, fp);
    } catch {
      /* ignore */
    }
  }

  private async checkForRemoteUpdate(): Promise<void> {
    if (!this.enabled) return;
    let local = '';
    try {
      local = sessionStorage.getItem(BUILD_FINGERPRINT) ?? this.fingerprintFromDocument();
    } catch {
      local = this.fingerprintFromDocument();
    }
    if (!local) return;

    const remote = await this.fetchRemoteFingerprint();
    if (!remote || remote === local) return;
    this.reloadForUpdate();
  }

  private async fetchRemoteFingerprint(): Promise<string | null> {
    try {
      const base = document.baseURI || '/';
      const indexUrl = new URL('index.html', base);
      indexUrl.searchParams.set('_', String(Date.now()));
      const res = await fetch(indexUrl.toString(), { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return null;
      return this.fingerprintFromIndexHtml(await res.text());
    } catch {
      return null;
    }
  }

  private fingerprintFromDocument(): string {
    return scriptFingerprint(
      Array.from(document.querySelectorAll('script[src]'))
        .map((el) => el.getAttribute('src') ?? '')
        .filter(Boolean),
    );
  }

  private fingerprintFromIndexHtml(html: string): string {
    const srcs: string[] = [];
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/gi)) {
      srcs.push(m[1]);
    }
    return scriptFingerprint(srcs);
  }

  private isStaleChunkFailure(reason: unknown): boolean {
    const text = errorText(reason);
    if (!text) return false;
    if (/ChunkLoadError|Loading chunk [\d]+ failed/i.test(text)) return true;
    if (/Failed to fetch dynamically imported module/i.test(text)) return true;
    if (/Importing a module script failed/i.test(text)) return true;
    if (/error loading dynamically imported module/i.test(text)) return true;
    return false;
  }

  private reloadForUpdate(): void {
    try {
      const last = Number(sessionStorage.getItem(RELOAD_ATTEMPT_AT) ?? 0);
      if (Date.now() - last < RELOAD_COOLDOWN_MS) return;
      sessionStorage.setItem(RELOAD_ATTEMPT_AT, String(Date.now()));
      sessionStorage.setItem(TOAST_FLAG, '1');
    } catch {
      /* still reload */
    }
    window.location.reload();
  }
}

function scriptFingerprint(srcs: string[]): string {
  const main = srcs.filter((s) => /\bmain[^/]*\.js(\?|$)/i.test(s) || /\/main[\-.][^/]+\.js/i.test(s));
  const poly = srcs.filter((s) => /polyfills[^/]*\.js/i.test(s));
  const picked = [...main, ...poly];
  const list = (picked.length ? picked : srcs).map(normalizeScriptSrc).sort();
  return list.join('|');
}

function normalizeScriptSrc(src: string): string {
  try {
    const u = new URL(src, document.baseURI);
    return u.pathname;
  } catch {
    return src.split('?')[0] ?? src;
  }
}

function errorText(reason: unknown): string {
  if (reason instanceof Error) return `${reason.name} ${reason.message}`;
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}
