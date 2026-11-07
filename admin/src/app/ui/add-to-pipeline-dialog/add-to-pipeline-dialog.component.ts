import { Component, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { MessageModule } from 'primeng/message';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { PipelinesApi, type PipelineSummary } from '../../core/pipelines.api';
import { HelpTextComponent } from '../help-text/help-text.component';

export type PipelinePlacement = {
  id: string;
  pipelineId: string;
  pipelineName: string;
  stageName: string;
};

@Component({
  selector: 'app-add-to-pipeline-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, SelectModule, MessageModule, AppDialogModule, HelpTextComponent],
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
      @if (pipelineOptions().length === 0 && !busy()) {
        <p class="text-color-secondary">{{ emptyMessage() }}</p>
      } @else {
        <div class="form-field">
          <label [attr.for]="inputId">
            Pipeline <app-help-text [key]="helpKey()" />
          </label>
          <p-select
            [inputId]="inputId"
            [options]="pipelineOptions()"
            optionLabel="label"
            optionValue="value"
            [ngModel]="pickId()"
            (ngModelChange)="pickId.set($event)"
            placeholder="Choose a pipeline"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
      }
      <div class="form-actions mt-3">
        <button type="button" pButton label="Cancel" severity="secondary" (click)="close()"></button>
        <button
          type="button"
          pButton
          label="Add to pipeline"
          [loading]="busy()"
          [disabled]="!pickId() || pipelineOptions().length === 0"
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
    'The card starts in the first lane. Team members with Pipeline notifications on were alerted.',
  );

  readonly inputId = `pipeline-pick-${Math.random().toString(36).slice(2, 9)}`;

  busy = signal(false);
  error = signal<string | null>(null);
  pickId = signal<string | null>(null);
  placements = signal<PipelinePlacement[]>([]);
  pipelineChoices = signal<PipelineSummary[]>([]);

  pipelineOptions(): { label: string; value: string }[] {
    const placed = new Set(this.placements().map((p) => p.pipelineId));
    return this.pipelineChoices()
      .filter((p) => !placed.has(p.id))
      .map((p) => ({ label: p.name, value: p.id }));
  }

  placementNames(): string {
    return this.placements()
      .map((p) => p.pipelineName)
      .join(', ');
  }

  async open() {
    this.error.set(null);
    this.busy.set(true);
    this.visible.set(true);
    try {
      const [pipelines, placements] = await Promise.all([
        this.pipelinesApi.list(),
        this.api.get<PipelinePlacement[]>(`${this.apiBase()}/pipeline-cards`),
      ]);
      this.pipelineChoices.set(pipelines);
      this.placements.set(placements);
      const available = pipelines.filter((p) => !placements.some((pl) => pl.pipelineId === p.id));
      this.pickId.set(available[0]?.id ?? pipelines[0]?.id ?? null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load pipelines');
    } finally {
      this.busy.set(false);
    }
  }

  async confirm() {
    const pipelineId = this.pickId();
    if (!pipelineId) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.post(`${this.apiBase()}/pipeline-cards`, { pipelineId });
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
