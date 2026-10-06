import { computed, inject, Injectable, signal } from '@angular/core';
import { TmApiService } from './tm-api.service';
import { Person, TmProjectListItem } from './tm.types';

/** Shared Task Manager state: sidebar project list, inbox badge, people cache. */
@Injectable({ providedIn: 'root' })
export class TmStoreService {
  private readonly api = inject(TmApiService);

  readonly projects = signal<TmProjectListItem[]>([]);
  readonly projectsLoaded = signal(false);
  readonly unreadCount = signal(0);
  private peopleCache = new Map<string, Promise<Person[]>>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly starred = computed(() =>
    this.projects()
      .filter((p) => p.isStarred)
      .sort((a, b) => (a.starOrder ?? 0) - (b.starOrder ?? 0)),
  );

  async loadProjects(): Promise<void> {
    try {
      this.projects.set(await this.api.listProjects());
    } finally {
      this.projectsLoaded.set(true);
    }
  }

  /** Optimistic local patch of a sidebar project (rename, color, star). */
  patchProject(id: string, patch: Partial<TmProjectListItem>): void {
    this.projects.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async toggleStar(project: { id: string; isStarred: boolean }): Promise<void> {
    const next = !project.isStarred;
    this.patchProject(project.id, { isStarred: next, starOrder: next ? Date.now() : null });
    try {
      await this.api.star(project.id, next);
    } catch {
      this.patchProject(project.id, { isStarred: !next });
    }
  }

  async refreshUnread(): Promise<void> {
    try {
      this.unreadCount.set((await this.api.unreadCount()).count);
    } catch {
      /* ignore — badge is best-effort */
    }
  }

  startPolling(): void {
    if (this.pollTimer) return;
    void this.refreshUnread();
    this.pollTimer = setInterval(() => void this.refreshUnread(), 60_000);
  }

  stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** Assignable / mentionable people for a project (cached for the session). */
  people(projectId?: string): Promise<Person[]> {
    const key = projectId ?? '*';
    let cached = this.peopleCache.get(key);
    if (!cached) {
      cached = this.api.people(projectId).catch((err) => {
        this.peopleCache.delete(key);
        throw err;
      });
      this.peopleCache.set(key, cached);
    }
    return cached;
  }

  invalidatePeople(projectId?: string): void {
    if (projectId) this.peopleCache.delete(projectId);
    else this.peopleCache.clear();
  }
}
