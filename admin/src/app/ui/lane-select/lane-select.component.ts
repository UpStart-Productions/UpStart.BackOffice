import { Component, computed, forwardRef, inject, input, OnInit, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { PipelinesApi, type PipelineSummary } from '../../core/pipelines.api';

/**
 * The app's pipeline lane picker: a **Pipeline** dropdown, then a **Lane** dropdown with that pipeline's lanes.
 * Renders both fields with their labels; the value (ngModel) is the lane id. Content projected into it goes after
 * the Lane label (e.g. an app-help-text). Used by booking types, form "Add submissions to a pipeline" and
 * capture points.
 */
@Component({
  selector: 'app-lane-select',
  standalone: true,
  imports: [FormsModule, SelectModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LaneSelectComponent), multi: true }],
  styles: `
    :host {
      display: contents;
    }
  `,
  template: `
    <div class="showcase-flex">
      <div class="form-field showcase-half">
        <label [for]="inputId() + '-pipeline'">Pipeline</label>
        <p-select
          [inputId]="inputId() + '-pipeline'"
          [options]="choices()"
          optionLabel="name"
          optionValue="id"
          [ngModel]="pipelineId()"
          (ngModelChange)="pickPipeline($event)"
          [disabled]="disabled()"
          [loading]="loading()"
          placeholder="Pick a pipeline"
          appendTo="body"
          styleClass="w-full"
          (onBlur)="onTouched()"
        />
      </div>
      <div class="form-field showcase-half">
        <label [for]="inputId() + '-lane'">Lane <ng-content /></label>
        <p-select
          [inputId]="inputId() + '-lane'"
          [options]="lanes()"
          optionLabel="name"
          optionValue="id"
          [ngModel]="value()"
          (ngModelChange)="pick($event)"
          [disabled]="disabled() || !pipelineId()"
          [placeholder]="placeholder()"
          [showClear]="showClear()"
          appendTo="body"
          styleClass="w-full"
          (onBlur)="onTouched()"
        />
      </div>
    </div>
  `,
})
export class LaneSelectComponent implements ControlValueAccessor, OnInit {
  private readonly api = inject(PipelinesApi);

  /** Id prefix for the two fields: `<inputId>-pipeline` and `<inputId>-lane`. */
  inputId = input('lane-select');
  /** Lane placeholder (e.g. "First lane" where blank means the pipeline's first lane). */
  placeholder = input('Pick a lane');
  showClear = input(false);
  /** Pipeline to start on when there's no lane yet (default: the first pipeline). */
  startPipelineId = input<string | null>(null);
  /** Pipelines not to offer (e.g. ones a record is already on). */
  excludePipelineIds = input<readonly string[]>([]);

  pipelines = signal<PipelineSummary[]>([]);
  pipelineId = signal<string | null>(null);
  value = signal<string | null>(null);
  disabled = signal(false);
  loading = signal(true);
  readonly choices = computed(() => {
    const skip = new Set(this.excludePipelineIds());
    return this.pipelines().filter((p) => !skip.has(p.id));
  });
  readonly lanes = computed(() => this.pipelines().find((p) => p.id === this.pipelineId())?.stages ?? []);
  /** The chosen pipeline (its id follows the lane). */
  readonly pipeline = computed(() => this.pipelines().find((p) => p.id === this.pipelineId()) ?? null);

  private onChange: (v: string | null) => void = () => {};
  onTouched: () => void = () => {};

  async ngOnInit() {
    try {
      this.pipelines.set(await this.api.list());
    } catch {
      this.pipelines.set([]);
    } finally {
      this.loading.set(false);
    }
    this.syncPipeline();
  }

  /** The pipeline follows the lane; with no lane, the starting pipeline (or the first one). */
  private syncPipeline() {
    const list = this.choices();
    if (!list.length) return;
    const lane = this.value();
    const owner = lane ? list.find((p) => p.stages.some((s) => s.id === lane)) : null;
    const start = list.find((p) => p.id === this.startPipelineId());
    const kept = list.find((p) => p.id === this.pipelineId());
    this.pipelineId.set(owner?.id ?? start?.id ?? kept?.id ?? list[0].id);
  }

  /** A new pipeline starts on its first lane (or blank, when blank is allowed). */
  pickPipeline(id: string | null) {
    this.pipelineId.set(id);
    const first = this.pipelines().find((p) => p.id === id)?.stages[0]?.id ?? null;
    this.pick(this.showClear() ? null : first);
  }

  pick(v: string | null) {
    this.value.set(v ?? null);
    this.onChange(v ?? null);
  }

  writeValue(v: string | null): void {
    this.value.set(v ?? null);
    this.syncPipeline();
  }
  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: (v: unknown) => void): void {
    this.onTouched = () => fn(undefined);
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }
}
