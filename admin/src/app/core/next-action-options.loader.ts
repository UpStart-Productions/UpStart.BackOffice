import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { mergeCreatableOptions, PIPELINE_NEXT_ACTION_PRESETS } from './pipeline-vocabulary';

/** Presets plus next-action strings already used on pipeline cards (same picker as Pipeline). */
@Injectable({ providedIn: 'root' })
export class NextActionOptionsLoader {
  private readonly api = inject(ApiService);
  private readonly used = signal<string[]>([]);
  private started = false;

  readonly options = computed(() => mergeCreatableOptions(PIPELINE_NEXT_ACTION_PRESETS, this.used()));

  load(): void {
    if (this.started) return;
    this.started = true;
    void this.api
      .get<{ nextActions: string[] }>('/leads/meta/suggestions')
      .then((meta) => this.used.set(meta.nextActions ?? []))
      .catch(() => {});
  }
}
