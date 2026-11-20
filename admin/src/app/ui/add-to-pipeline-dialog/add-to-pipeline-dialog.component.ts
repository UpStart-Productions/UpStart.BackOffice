import { Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { PipelinesApi, type PipelineSummary } from '../../core/pipelines.api';
import { HelpTextComponent } from '../help-text/help-text.component';
import { LaneSelectComponent } from '../lane-select/lane-select.component';

export type PipelinePlacement = {
  id: string;
  pipelineId: string;
  pipelineName: string;
  stageName: string;
};

@Component({
  selector: 'app-add-to-pipeline-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, MessageModule, AppDialogModule, HelpTextComponent, LaneSelectComponent],
  template: `
    <p-dialog
      header="Add to pipeline"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [style]="{ width: '28rem' }"
      appendTo="body"
    >
      @if (error()) {
        <p-message severity="error" [text]="error()!" styleClass="mb-3" />
      }
      @if (placements().length) {
        <p class="text-color-secondary mb-3">Already on: {{ placementNames() }}.</p>
      }
      @if (!loaded()) {
        <p class="text-color-secondary">Loading...</p>
      } @else if (pipelineOptions().length === 0) {
        <p class="text-color-secondary">{{ emptyMessage() }}</p>
      } @else {
        <app-lane-select [inputId]="inputId" [excludePipelineIds]="placedIds()" [ngModel]="laneId()" (ngModelChange)="laneId.set($event)"><app-help-text [key]="helpKey()" /></app-lane-select>
      }
      <div class="form-actions mt-3">
        <button type="button" pButton label="Cancel" severity="secondary" (click)="close()"></button>
        <button
          type="button"
          pButton
          label="Add to pipeline"
          [loading]="busy()"
          [disabled]="!laneId() || pipelineOptions().length === 0"
          (click)="confirm()"
        ></button>
      </div>
    </p-dialog>
  `,
})
export class AddToPipelineDialogComponent {
  private readonly api = inject(ApiService);
  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly toast = inject(MessageService);

  readonly visible = model(false);
  /** e.g. `/clients/abc` — GET/POST `${apiBase}/pipeline-cards` */
  readonly apiBase = input.required<string>();
  readonly helpKey = input.required<string>();
  readonly emptyMessage = input(
    'This record is on every pipeline already, or there are no pipelines yet.',
  );
  readonly successSummary = input('Added to pipeline');
  readonly successDetail = input(
    'The card is in the lane you picked. Team members with Pipeline notifications on were alerted.',
  );

  readonly inputId = `pipeline-pick-${Math.random().toString(36).slice(2, 9)}`;

  busy = signal(false);
  error = signal<string | null>(null);
  laneId = signal<string | null>(null);
  /** Pipelines and placements are in (the lane picker waits for them, so it skips pipelines the record is on). */
  loaded = signal(false);
  placements = signal<PipelinePlacement[]>([]);
  pipelineChoices = signal<PipelineSummary[]>([]);

  pipelineOptions(): { label: string; value: string }[] {
    const placed = new Set(this.placements().map((p) => p.pipelineId));
    return this.pipelineChoices()
      .filter((p) => !placed.has(p.id))
      .map((p) => ({ label: p.name, value: p.id }));
  }

  placedIds(): string[] {
    return this.placements().map((p) => p.pipelineId);
  }

  placementNames(): string {
    return this.placements()
      .map((p) => p.pipelineName)
      .join(', ');
  }

  async open() {
    this.error.set(null);
    this.busy.set(true);
    this.loaded.set(false);
    this.visible.set(true);
    try {
      const [pipelines, placements] = await Promise.all([
        this.pipelinesApi.list(),
        this.api.get<PipelinePlacement[]>(`${this.apiBase()}/pipeline-cards`),
      ]);
      this.pipelineChoices.set(pipelines);
      this.placements.set(placements);
      // Start on the first lane of the first pipeline the record isn't on yet.
      const available = pipelines.find((p) => !placements.some((pl) => pl.pipelineId === p.id));
      this.laneId.set(available?.stages[0]?.id ?? null);
      this.loaded.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load pipelines');
    } finally {
      this.busy.set(false);
    }
  }

  async confirm() {
    const stageId = this.laneId();
    const pipelineId = this.pipelineChoices().find((p) => p.stages.some((s) => s.id === stageId))?.id;
    if (!stageId || !pipelineId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.post(`${this.apiBase()}/pipeline-cards`, { pipelineId, stageId });
      const placements = await this.api.get<PipelinePlacement[]>(`${this.apiBase()}/pipeline-cards`);
      this.placements.set(placements);
      this.toast.add({
        severity: 'success',
        summary: this.successSummary(),
        detail: this.successDetail(),
        life: 5000,
      });
      this.close();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Could not add to pipeline');
    } finally {
      this.busy.set(false);
    }
  }

  close() {
    this.visible.set(false);
  }

  onVisibleChange(open: boolean) {
    this.visible.set(open);
    if (!open) this.error.set(null);
  }
}
