import { Injectable, inject, signal } from '@angular/core';
import type { DimensionDefinitionDto, DimensionEntity } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DimensionsApi {
  private readonly api = inject(ApiService);
  private readonly clientDefs = signal<DimensionDefinitionDto[] | null>(null);
  private loadPromise: Promise<DimensionDefinitionDto[]> | null = null;
  private readonly leadDefs = signal<DimensionDefinitionDto[] | null>(null);
  private leadPromise: Promise<DimensionDefinitionDto[]> | null = null;

  /** Cached CLIENT dimension definitions for account forms, or LEAD pick lists (contact sources) for pipeline cards. */
  definitions(entity: DimensionEntity = 'CLIENT') {
    if (entity === 'CLIENT') return this.clientDefs();
    if (entity === 'LEAD') return this.leadDefs();
    return null;
  }

  /** Values of one pick list (for example LEAD contact sources, or CLIENT focus areas). Empty until loaded. */
  values(entity: DimensionEntity, key: string): string[] {
    return this.definitions(entity)?.find((d) => d.key === key)?.presets ?? [];
  }

  /** Pipeline card pick lists (Settings → Pick lists → Pipeline). */
  async loadLeadDefinitions(refresh = false): Promise<DimensionDefinitionDto[]> {
    if (refresh) {
      this.leadDefs.set(null);
      this.leadPromise = null;
    }
    if (this.leadDefs()) return this.leadDefs()!;
    if (!this.leadPromise) {
      this.leadPromise = this.api.get<DimensionDefinitionDto[]>('/dimensions/definitions?entity=LEAD').then((rows) => {
        this.leadDefs.set(rows);
        return rows;
      });
    }
    return this.leadPromise;
  }

  async loadClientDefinitions(refresh = false): Promise<DimensionDefinitionDto[]> {
    if (refresh) {
      this.clientDefs.set(null);
      this.loadPromise = null;
    }
    if (this.clientDefs()) return this.clientDefs()!;
    if (!this.loadPromise) {
      this.loadPromise = this.api
        .get<DimensionDefinitionDto[]>('/dimensions/definitions?entity=CLIENT')
        .then((rows) => {
          this.clientDefs.set(rows);
          return rows;
        });
    }
    return this.loadPromise;
  }

  /** Pick up new services/products/focus suggestions after a save. */
  reloadClientDefinitions(): Promise<DimensionDefinitionDto[]> {
    return this.loadClientDefinitions(true);
  }
}
