import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover } from 'primeng/popover';
import { AppDialogModule } from '../../core/app-dialog.module';
import { AppPopoverModule } from '../../core/app-popover.module';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import {
  formatDayHeading,
  formatDurationMin,
  parseDurationInput,
  sanitizeDurationInput,
} from './timesheet.utils';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import type { ClientOption, Project, TimeEntry, TmTaskOption, TmTaskSearchHit } from './time-entry.types';
import type { RecordAttributionDto } from '@upstart/back-office/shared';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';

function tmTaskLabel(task: { name: string; parent?: { name: string } | null }): string {
  return task.parent?.name ? `${task.parent.name} › ${task.name}` : task.name;
}

export type TimeEntryModalResult = 'saved' | 'started' | 'deleted' | 'cancelled';

@Component({
  selector: 'app-time-entry-modal',
  standalone: true,
  imports: [
    FormsModule,
    AppDialogModule,
    AppPopoverModule,
    ButtonModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    RecordAttributionComponent,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [closable]="true"
      [style]="{ width: '32rem' }"
      (onHide)="onDialogHide()"
    >
      <ng-template pTemplate="header">
        <div class="entry-dialog-header">
          <span class="p-dialog-title entry-dialog-header-title">{{
            isEdit() ? 'Edit time entry for' : 'New time entry for'
          }}</span>
          @if (isEdit()) {
            <app-record-attribution [attribution]="attribution()" />
          }
          <button
            type="button"
            class="entry-day-trigger"
            (click)="entryDayPopover.toggle($event)"
            aria-haspopup="dialog"
            [attr.aria-label]="'Entry date, ' + entryDayLabel()"
          >
            <i class="pi pi-calendar" aria-hidden="true"></i>
            <span>{{ entryDayLabel() }}</span>
          </button>
          <p-popover
            #entryDayPopover
            appendTo="body"
            appCenterPopoverCaret
            styleClass="entry-day-popover"
            [dismissable]="true"
          >
            <p-datepicker
              [inline]="true"
              [ngModel]="entryDay()"
              [defaultDate]="entryDay()"
              (onSelect)="pickEntryDay($event, entryDayPopover)"
            />
          </p-popover>
        </div>
      </ng-template>
      <div class="entry-form">
        @if (projectOptions().length > 0) {
        <div class="form-field">
          <label for="entry-project">Project (optional)</label>
          <p-select
            inputId="entry-project"
            [options]="projectOptions()"
            optionLabel="projectName"
            optionValue="id"
            [ngModel]="projectId()"
            (ngModelChange)="onProjectIdChange($event)"
            [filter]="true"
            filterBy="projectName,clientName"
            filterPlaceholder="Search by client or project…"
            placeholder="No project"
            [showClear]="true"
            styleClass="w-full entry-project-select"
            panelStyleClass="entry-project-select-panel"
            appendTo="body"
          >
            <ng-template #selectedItem let-option>
              @if (option) {
                <span class="entry-project-option">
                  <span class="entry-project-name">{{ option.projectName }}</span>
                  <span class="entry-project-client">{{ option.clientName }}</span>
                </span>
              }
            </ng-template>
            <ng-template #item let-option>
              <span class="entry-project-option">
                <span class="entry-project-name">{{ option.projectName }}</span>
                <span class="entry-project-client">{{ option.clientName }}</span>
              </span>
            </ng-template>
          </p-select>
        </div>
        }

        @if (!projectId() && clients().length > 0) {
          <div class="form-field">
            <label for="entry-client">Client (optional)</label>
            <p-select
              inputId="entry-client"
              [options]="clients()"
              optionLabel="name"
              optionValue="id"
              [ngModel]="clientId()"
              (ngModelChange)="clientId.set($event ?? '')"
              [filter]="clients().length > 8"
              filterBy="name"
              placeholder="No client"
              [showClear]="true"
              styleClass="w-full"
              appendTo="body"
            />
          </div>
        }

        @if (manualTasks().length > 0) {
          <div class="form-field">
            <label for="entry-task">Task</label>
            <select
              id="entry-task"
              class="task-select"
              [ngModel]="manualTaskId()"
              (ngModelChange)="onManualTaskChange($event)"
            >
              <option value="">Select a task</option>
              @for (t of manualTasks(); track t.id) {
                <option [value]="t.id">
                  {{ t.name }} ({{ t.isBillable ? 'Billable' : 'Non-billable' }})
                </option>
              }
            </select>
          </div>
        }

        @if (showWorkTaskField()) {
          <div class="form-field">
            <label for="entry-work-task">Work task</label>
            <p-select
              inputId="entry-work-task"
              [options]="tmTaskOptions()"
              optionLabel="label"
              optionValue="id"
              [ngModel]="tmTaskId()"
              (ngModelChange)="onTmTaskChange($event)"
              [filter]="true"
              filterBy="label,name"
              filterPlaceholder="Search tasks…"
              [showClear]="true"
              placeholder="Select a task"
              styleClass="w-full entry-work-task-select"
              panelStyleClass="entry-work-task-select-panel"
              appendTo="body"
            >
              <ng-template #selectedItem let-option>
                @if (option) {
                  <span class="entry-work-task-option">
                    <span class="entry-work-task-name">{{ option.name }}</span>
                    @if (option.parent?.name) {
                      <span class="entry-work-task-parent">{{ option.parent.name }}</span>
                    }
                  </span>
                }
              </ng-template>
              <ng-template #item let-option>
                <span class="entry-work-task-option">
                  <span class="entry-work-task-name">{{ option.name }}</span>
                  @if (option.parent?.name) {
                    <span class="entry-work-task-parent">{{ option.parent.name }}</span>
                  }
                </span>
              </ng-template>
            </p-select>
          </div>
        }

        @if (showAsanaTaskPicker()) {
          <div class="form-field">
            <label for="entry-asana-task">Asana task</label>
            @if (syncingAsanaTasks()) {
              <p class="sync-hint">Syncing from Asana…</p>
            } @else {
              <select
                id="entry-asana-task"
                class="task-select"
                [ngModel]="asanaTaskId()"
                (ngModelChange)="onAsanaTaskChange($event)"
              >
                <option value="">Select an Asana task</option>
                @for (t of asanaTasks(); track t.id) {
                  <option [value]="t.id">{{ t.name }}</option>
                }
              </select>
            }
          </div>
        }

        <div class="form-field">
          <label for="entry-notes">Notes (optional)</label>
          <textarea
            pTextarea
            id="entry-notes"
            rows="3"
            placeholder="What did you work on?"
            [ngModel]="notes()"
            (ngModelChange)="notes.set($event)"
            class="w-full"
          ></textarea>
        </div>

        <div class="form-field duration-field">
          <label for="entry-duration">Duration</label>
          <input
            id="entry-duration"
            type="text"
            class="duration-input"
            placeholder="0:00"
            autocomplete="off"
            [value]="durationInput()"
            (keydown)="onDurationKeydown($event)"
            (input)="onDurationInput($event)"
            (paste)="onDurationPaste($event)"
          />
        </div>

        @if (error()) {
          <div class="error-text" role="alert">{{ error() }}</div>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="dialog-footer">
          <div class="footer-left">
            @if (isEdit()) {
              <button
                type="button"
                pButton
                label="Delete"
                severity="danger"
                [text]="true"
                [loading]="saving()"
                (click)="deleteEntry()"
              ></button>
            }
          </div>
          <div class="footer-right">
            <button
              type="button"
              pButton
              label="Cancel"
              severity="secondary"
              [text]="true"
              (click)="cancel()"
            ></button>
            @if (isEdit()) {
              <button
                type="button"
                pButton
                label="Save"
                [loading]="saving()"
                [disabled]="!canSubmit() || saving()"
                (click)="saveEntry()"
              ></button>
            } @else {
              @if (canSave()) {
                <button
                  type="button"
                  pButton
                  label="Save entry"
                  [loading]="saving()"
                  [disabled]="!canSubmit() || saving()"
                  (click)="saveEntry()"
                ></button>
              }
              <button
                type="button"
                pButton
                label="Start timer"
                icon="pi pi-clock"
                severity="success"
                [outlined]="true"
                [loading]="saving()"
                [disabled]="!canSubmit() || saving()"
                (click)="startTimer()"
              ></button>
            }
          </div>
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .entry-dialog-header {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.25rem 0.375rem;
    }

    .entry-dialog-header-title {
      flex: 0 0 auto;
    }

    .entry-day-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      margin: 0;
      padding: 0.125rem 0.375rem;
      border: 1px solid transparent;
      border-radius: 0.375rem;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
      color: #7c3aed;
      line-height: 1.25;
    }

    .entry-day-trigger:hover {
      background: #f5f3ff;
      border-color: #ede9fe;
    }

    .entry-day-trigger:focus-visible {
      outline: 2px solid #7c3aed;
      outline-offset: 2px;
    }

    .entry-day-trigger .pi {
      font-size: 1em;
      line-height: 1;
    }

    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-field label {
      display: block;
      font-size: var(--fs-sm);
      font-weight: 600;
      margin-bottom: 0.35rem;
      color: #2d2d2d;
    }

    .entry-project-option {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      min-width: 0;
      line-height: 1.3;
    }

    .entry-project-name {
      font-weight: 600;
      font-size: var(--fs-sm);
      color: #2d2d2d;
    }

    .entry-project-client {
      font-weight: 400;
      font-size: var(--fs-sm);
      color: #6b7785;
    }

    .duration-input {
      width: 6rem;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      padding: 0.5rem 0.625rem;
      font-size: var(--fs-md);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .task-select {
      width: 100%;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      background: #fff;
      padding: 0.625rem 0.75rem;
      font-size: var(--fs-base);
      color: #2d2d2d;
    }

    .entry-work-task-option {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      line-height: 1.3;
    }

    .entry-work-task-name {
      font-weight: 600;
      color: #2d2d2d;
    }

    .entry-work-task-parent {
      font-size: var(--fs-sm);
      color: #6b7785;
    }

    .sync-hint {
      margin: 0;
      padding: 0.625rem 0.75rem;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      background: #f8f9fa;
      font-size: var(--fs-base);
      color: #6b7785;
    }

    .error-text {
      color: #a94442;
      font-size: var(--fs-sm);
    }

    .dialog-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      gap: 0.5rem;
    }

    .footer-right {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
  `,
})
export class TimeEntryModalComponent {
  private readonly api = inject(ApiService);
  private readonly tmApi = inject(TmApiService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  visible = false;
  saving = signal(false);
  error = signal<string | null>(null);
  isEdit = signal(false);
  entryDay = signal(new Date());
  editingEntry = signal<TimeEntry | null>(null);
  readonly attribution = signal<RecordAttributionDto | null>(null);
  projects = signal<Project[]>([]);
  clients = signal<ClientOption[]>([]);
  asanaConnected = signal(false);

  projectId = signal('');
  clientId = signal('');
  manualTaskId = signal('');
  asanaTaskId = signal('');
  tmTaskId = signal('');
  tmTaskOptions = signal<TmTaskOption[]>([]);
  notes = signal('');
  durationInput = signal('');
  loadingAsanaNotes = signal(false);
  syncingAsanaTasks = signal(false);
  loadingTmTasks = signal(false);

  private asanaSyncPromise: Promise<void> | null = null;

  readonly selectedProject = computed(() => {
    const id = this.projectId();
    return this.projects().find((p) => p.id === id);
  });

  readonly manualTasks = computed(() => {
    const tasks = this.selectedProject()?.tasks ?? [];
    return tasks.filter((t) => t.source !== 'ASANA');
  });

  readonly asanaTasks = computed(() => {
    const tasks = this.selectedProject()?.tasks ?? [];
    return tasks.filter((t) => t.source === 'ASANA' && t.isActive !== false);
  });

  readonly showAsanaTaskPicker = computed(
    () => this.asanaConnected() && !!this.selectedProject()?.asanaSectionGid,
  );

  readonly requiresTask = computed(
    () =>
      this.manualTasks().length > 0 ||
      this.showAsanaTaskPicker() ||
      (!!this.projectId() && this.tmTaskOptions().length > 0),
  );

  readonly hasSelectedTask = computed(
    () => !!(this.manualTaskId() || this.asanaTaskId() || this.tmTaskId()),
  );

  readonly canSubmit = computed(() => {
    if (this.requiresTask() && !this.hasSelectedTask()) return false;
    return true;
  });

  readonly selectableProjects = computed(() => {
    const editingProjectId = this.editingEntry()?.project?.id;
    return this.projects().filter(
      (p) => p.isActive !== false || p.id === editingProjectId,
    );
  });

  readonly projectOptions = computed(() =>
    this.selectableProjects().map((p) => ({
      id: p.id,
      projectName: p.name,
      clientName: (p.client?.name ?? 'Personal'),
    })),
  );

  readonly showWorkTaskField = computed(
    () => !!this.projectId() && this.tmTaskOptions().length > 0,
  );

  readonly entryDayLabel = computed(() => formatDayHeading(this.entryDay()));

  readonly canSave = computed(() => {
    const parsed = parseDurationInput(this.durationInput());
    return parsed !== null && parsed > 0;
  });

  private resolve: ((result: TimeEntryModalResult) => void) | null = null;

  open(options: {
    day: Date;
    projects: Project[];
    /** Clients to pick from when logging time without a project. */
    clients?: ClientOption[];
    asanaConnected?: boolean;
    entry?: TimeEntry;
  }): Promise<TimeEntryModalResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.projects.set(options.projects);
      this.clients.set(options.clients ?? []);
      this.asanaConnected.set(options.asanaConnected ?? false);
      this.entryDay.set(new Date(options.day));
      this.editingEntry.set(options.entry ?? null);
      this.isEdit.set(!!options.entry);
      this.attribution.set(options.entry?.attribution ?? null);
      this.error.set(null);
      this.loadingAsanaNotes.set(false);

      if (options.entry) {
        this.projectId.set(options.entry.project?.id ?? '');
        this.clientId.set(options.entry.project ? '' : (options.entry.client?.id ?? ''));
        this.notes.set(options.entry.description ?? '');
        this.durationInput.set(
          options.entry.durationMin != null
            ? formatDurationMin(options.entry.durationMin)
            : '',
        );
        this.setTaskIdsFromEntry(options.entry);
        this.setTmTaskFromEntry(options.entry);
      } else {
        this.projectId.set('');
        this.clientId.set('');
        this.manualTaskId.set('');
        this.asanaTaskId.set('');
        this.tmTaskId.set('');
        this.tmTaskOptions.set([]);
        this.notes.set('');
        this.durationInput.set('');
      }

      this.visible = true;

      if (options.entry) void this.loadAttribution(options.entry.id);

      const projectId = options.entry?.project?.id;
      if (projectId) {
        const project = options.projects.find((p) => p.id === projectId);
        if (project?.asanaSectionGid && this.asanaConnected()) {
          void this.syncAsanaTasksIfNeeded(project.id);
        }
        void this.loadTmTaskOptions(projectId, options.entry?.task ?? null);
      }
    });
  }

  private async loadAttribution(entryId: string) {
    try {
      const res = await this.api.get<{ attribution?: RecordAttributionDto }>(`/time-entries/${entryId}`);
      this.attribution.set(res.attribution ?? null);
    } catch {
      this.attribution.set(null);
    }
  }

  private setTmTaskFromEntry(entry: TimeEntry) {
    this.tmTaskId.set(entry.taskId ?? entry.task?.id ?? '');
  }

  private setTaskIdsFromEntry(entry: TimeEntry) {
    const taskId = entry.projectTaskId ?? entry.projectTask?.id ?? '';
    if (!taskId) {
      this.manualTaskId.set('');
      this.asanaTaskId.set('');
      return;
    }

    const project = this.projects().find((p) => p.id === entry.project?.id);
    const cachedTask = project?.tasks?.find((t) => t.id === taskId);
    const isAsana =
      entry.projectTask?.source === 'ASANA' ||
      cachedTask?.source === 'ASANA' ||
      (!!project?.asanaSectionGid && cachedTask?.source !== 'MANUAL' && !!entry.projectTask);

    if (isAsana) {
      this.asanaTaskId.set(taskId);
      this.manualTaskId.set('');
      this.ensureEntryTaskInProject(entry);
    } else {
      this.manualTaskId.set(taskId);
      this.asanaTaskId.set('');
    }
  }

  private ensureEntryTaskInProject(entry: TimeEntry) {
    const taskId = entry.projectTaskId ?? entry.projectTask?.id;
    const pt = entry.projectTask;
    if (!taskId || !pt) return;

    this.projects.update((list) =>
      list.map((p) => {
        if (p.id !== entry.project?.id) return p;
        if (p.tasks?.some((t) => t.id === taskId)) return p;
        return {
          ...p,
          tasks: [
            ...(p.tasks ?? []),
            {
              id: pt.id,
              projectId: p.id,
              name: pt.name,
              source: 'ASANA' as const,
              isBillable: pt.isBillable,
              sortOrder: 999,
              isActive: true,
            },
          ],
        };
      }),
    );
  }

  onProjectIdChange(id: string | null) {
    const p = this.projects().find((x) => x.id === id);
    if (!p) {
      // Cleared: time without a project.
      this.projectId.set('');
      this.manualTaskId.set('');
      this.asanaTaskId.set('');
      this.tmTaskId.set('');
      this.tmTaskOptions.set([]);
      return;
    }
    this.clientId.set('');
    this.selectProject(p);
  }

  selectProject(p: Project) {
    this.projectId.set(p.id);
    this.manualTaskId.set('');
    this.asanaTaskId.set('');
    this.tmTaskId.set('');
    this.tmTaskOptions.set([]);
    const manual = (p.tasks ?? []).filter((t) => t.source !== 'ASANA');
    if (manual.length === 1) {
      this.manualTaskId.set(manual[0].id);
    }
    if (p.asanaSectionGid && this.asanaConnected()) {
      void this.syncAsanaTasksIfNeeded(p.id);
    }
    void this.loadTmTaskOptions(p.id);
  }

  onManualTaskChange(taskId: string) {
    this.manualTaskId.set(taskId);
    if (taskId) {
      this.asanaTaskId.set('');
      this.tmTaskId.set('');
    }
  }

  onTmTaskChange(taskId: string | null) {
    const id = taskId ?? '';
    this.tmTaskId.set(id);
    if (id) {
      this.manualTaskId.set('');
      this.asanaTaskId.set('');
    }
  }

  async syncAsanaTasksIfNeeded(projectId: string) {
    if (!this.asanaConnected()) return;

    if (this.asanaSyncPromise) {
      await this.asanaSyncPromise;
      return;
    }

    this.syncingAsanaTasks.set(true);
    this.asanaSyncPromise = this.syncAsanaTasksForProject(projectId).finally(() => {
      this.syncingAsanaTasks.set(false);
      this.asanaSyncPromise = null;
    });
    await this.asanaSyncPromise;
  }

  private async syncAsanaTasksForProject(projectId: string) {
    try {
      const synced = await this.api.post<Project>(`/projects/${projectId}/asana/sync`);
      this.applySyncedProject(synced);
    } catch {
      /* keep existing tasks if sync fails */
    }
  }

  private applySyncedProject(synced: Project) {
    const syncedAsana = (synced.tasks ?? []).filter(
      (t) => t.source === 'ASANA' && t.isActive !== false,
    );
    const selectedId = this.asanaTaskId();
    const entryTask = this.editingEntry()?.projectTask;

    this.projects.update((list) =>
      list.map((p) => {
        if (p.id !== synced.id) return p;
        const manual = (p.tasks ?? []).filter((t) => t.source !== 'ASANA');
        let asana = syncedAsana;

        if (
          selectedId &&
          !asana.some((t) => t.id === selectedId) &&
          entryTask?.id === selectedId
        ) {
          asana = [
            {
              id: entryTask.id,
              projectId: p.id,
              name: entryTask.name,
              source: 'ASANA' as const,
              isBillable: entryTask.isBillable,
              sortOrder: 999,
              isActive: true,
            },
            ...asana,
          ];
        }

        return {
          ...p,
          asanaSectionGid: synced.asanaSectionGid ?? p.asanaSectionGid,
          tasks: [...manual, ...asana],
        };
      }),
    );
  }

  async onAsanaTaskChange(taskId: string) {
    this.asanaTaskId.set(taskId);
    if (taskId) {
      this.manualTaskId.set('');
      this.tmTaskId.set('');
    }

    if (!taskId) return;

    const task = this.asanaTasks().find((t) => t.id === taskId);
    if (!task?.asanaTaskGid) return;

    this.loadingAsanaNotes.set(true);
    try {
      const result = await this.api.get<{ notes: string | null; permalinkUrl: string | null }>(
        `/asana/tasks/${encodeURIComponent(task.asanaTaskGid)}/notes`,
      );
      const parts: string[] = [];
      if (result.notes) parts.push(result.notes);
      if (result.permalinkUrl) parts.push(result.permalinkUrl);
      if (parts.length > 0) {
        this.notes.set(parts.join('\n\n'));
      }
    } catch {
      /* keep existing notes if Asana fetch fails */
    } finally {
      this.loadingAsanaNotes.set(false);
    }
  }

  onDurationKeydown(event: KeyboardEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length === 1 && /[^0-9:.]/.test(event.key)) {
      event.preventDefault();
    }
  }

  onDurationPaste(event: ClipboardEvent) {
    event.preventDefault();
    const input = event.target as HTMLInputElement;
    const pasted = sanitizeDurationInput(event.clipboardData?.getData('text') ?? '');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const next = sanitizeDurationInput(
      `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`,
    );
    this.applyDurationValue(input, next);
  }

  onDurationInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.applyDurationValue(input, sanitizeDurationInput(input.value));
  }

  private applyDurationValue(input: HTMLInputElement, next: string) {
    this.durationInput.set(next);
    if (input.value !== next) input.value = next;
  }

  onEntryDayChange(value: Date | Date[] | null) {
    const next = Array.isArray(value) ? value[0] : value;
    if (!(next instanceof Date) || Number.isNaN(next.getTime())) return;
    this.entryDay.set(next);
  }

  pickEntryDay(date: Date, popover: Popover) {
    this.onEntryDayChange(date);
    popover.hide();
  }

  onDialogHide() {
    this.error.set(null);
  }

  cancel() {
    this.visible = false;
    this.resolve?.('cancelled');
    this.resolve = null;
  }

  private dayStartAt(hour = 9): Date {
    const d = new Date(this.entryDay());
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  private startedAtOnEntryDay(source: Date): Date {
    const day = this.entryDay();
    const next = new Date(source);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    return next;
  }

  private selectedProjectTaskId(): string {
    return this.asanaTaskId() || this.manualTaskId();
  }

  private toTmTaskOption(row: TmTaskSearchHit): TmTaskOption {
    return { ...row, label: tmTaskLabel(row) };
  }

  private projectInTaskManager(projectId: string): boolean {
    return this.projects().find((p) => p.id === projectId)?.inTaskManager === true;
  }

  async loadTmTaskOptions(projectId: string, selected?: TimeEntry['task']) {
    if (!this.projectInTaskManager(projectId)) {
      this.tmTaskOptions.set([]);
      return;
    }
    this.loadingTmTasks.set(true);
    try {
      const project = this.selectedProject();
      const rows = await this.tmApi.listTasks(projectId, 'incomplete');
      const hits: TmTaskSearchHit[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        project: { id: projectId, name: project?.name ?? '' },
        parent: null,
      }));
      let options = hits.map((row) => this.toTmTaskOption(row));
      if (selected && !options.some((o) => o.id === selected.id)) {
        options = [
          this.toTmTaskOption({
            id: selected.id,
            name: selected.name,
            project: { id: projectId, name: this.selectedProject()?.name ?? '' },
            parent: selected.parent ?? null,
          }),
          ...options,
        ];
      }
      this.tmTaskOptions.set(options);
    } catch {
      this.tmTaskOptions.set([]);
    } finally {
      this.loadingTmTasks.set(false);
    }
  }

  private assertTaskSelectedForSave(): boolean {
    if (this.requiresTask() && !this.hasSelectedTask()) {
      this.error.set('Choose a task, work task, or Asana task.');
      return false;
    }
    return true;
  }

  private entryPayload(projectId: string) {
    const payload: Record<string, unknown> = {
      projectId: projectId || null,
      clientId: projectId ? null : this.clientId() || null,
      description: this.notes().trim() || undefined,
      taskId: this.tmTaskId() || null,
    };
    const projectTaskId = this.selectedProjectTaskId();
    if (projectTaskId) payload['projectTaskId'] = projectTaskId;
    return payload;
  }

  async saveEntry() {
    const projectId = this.projectId();
    if (!this.assertTaskSelectedForSave()) return;

    const existing = this.editingEntry();
    let durationMin: number;
    const trimmed = this.durationInput().trim();
    if (existing && !trimmed) {
      durationMin = existing.durationMin ?? 0;
    } else {
      const parsed = parseDurationInput(this.durationInput());
      if (parsed === null) {
        this.error.set('Invalid duration. Use H:MM (2:30) or decimal hours (2.5).');
        return;
      }
      durationMin = parsed;
    }

    if (!existing && durationMin <= 0) {
      this.error.set('Enter a duration or use Start timer.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const startedAt = existing
        ? this.startedAtOnEntryDay(new Date(existing.startedAt))
        : this.dayStartAt();
      const stoppedAt = new Date(startedAt.getTime() + durationMin * 60_000);

      if (existing) {
        const updated = await this.api.put<{ attribution?: RecordAttributionDto }>(
          `/time-entries/${existing.id}`,
          {
            ...this.entryPayload(projectId),
            startedAt: startedAt.toISOString(),
            stoppedAt: stoppedAt.toISOString(),
          },
        );
        if (updated?.attribution) {
          this.attribution.set(updated.attribution);
        } else {
          await this.loadAttribution(existing.id);
        }
      } else {
        await this.api.post('/time-entries', {
          ...this.entryPayload(projectId),
          startedAt: startedAt.toISOString(),
          stoppedAt: stoppedAt.toISOString(),
        });
      }

      this.visible = false;
      this.resolve?.('saved');
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }

  async startTimer() {
    const projectId = this.projectId();
    if (!this.assertTaskSelectedForSave()) return;

    this.saving.set(true);
    this.error.set(null);

    try {
      await this.api.post('/time-entries', {
        ...this.entryPayload(projectId),
        startedAt: new Date().toISOString(),
      });

      this.visible = false;
      this.resolve?.('started');
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start timer');
    } finally {
      this.saving.set(false);
    }
  }

  deleteEntry() {
    const existing = this.editingEntry();
    if (!existing) return;

    const label = existing.project
      ? `${existing.project.name} (${existing.project.client?.name ?? 'Personal'})`
      : existing.client?.name ?? 'No project';
    this.deleteConfirm.confirm({
      message: `Delete this time entry for "${label}"? This cannot be undone.`,
      accept: () => this.performDelete(existing.id),
    });
  }

  private async performDelete(entryId: string) {
    this.saving.set(true);
    this.error.set(null);

    try {
      await this.api.delete(`/time-entries/${entryId}`);
      this.visible = false;
      this.resolve?.('deleted');
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      this.saving.set(false);
    }
  }
}
