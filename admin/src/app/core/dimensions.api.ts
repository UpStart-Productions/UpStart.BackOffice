import { Injectable, inject, signal } from '@angular/core';
import type { DimensionDefinitionDto, DimensionEntity } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class DimensionsApi {
  private readonly api = inject(ApiService);
  private readonly clientDefs = signal<DimensionDefinitionDto[] | null>(null);
  private loadPromise: Promise<DimensionDefinitionDto[]> | null = null;

  /** Cached CLIENT dimension definitions for organization forms. */
  definitions(entity: DimensionEntity = 'CLIENT') {
    if (entity === 'CLIENT') return this.clientDefs();
    return null;
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
