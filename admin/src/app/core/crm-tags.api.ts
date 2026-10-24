import { inject, Injectable, signal } from '@angular/core';
import { CRM_TAG_SUGGESTIONS } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

export interface CrmTag {
  id: string;
  name: string;
  color: string | null;
  organizationCount: number;
  peopleCount: number;
}

/** The tenant's CRM tags (organizations and people), loaded once and refreshed after edits. */
@Injectable({ providedIn: 'root' })
export class CrmTagsApi {
  private readonly api = inject(ApiService);
  readonly tags = signal<CrmTag[]>([]);
  private loaded: Promise<void> | null = null;

  load(force = false): Promise<void> {
    if (!this.loaded || force) {
      this.loaded = this.api
        .get<CrmTag[]>('/crm-tags')
        .then((list) => this.tags.set(list))
        .catch(() => {
          this.loaded = null;
        });
    }
    return this.loaded;
  }

  /** Names to offer: existing tags first, then the built-in suggestions not yet used. */
  names(): string[] {
    const existing = this.tags().map((t) => t.name);
    const keys = new Set(existing.map((n) => n.toLowerCase()));
    return [...existing, ...CRM_TAG_SUGGESTIONS.filter((n) => !keys.has(n.toLowerCase()))];
  }
}
