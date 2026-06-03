import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import {
  formatDayHeading,
  formatDurationMin,
  parseDurationInput,
} from './timesheet.utils';
import type { Project, TimeEntry } from './time-entry.types';

export type TimeEntryModalResult = 'saved' | 'started' | 'deleted' | 'cancelled';

@Component({
  selector: 'app-time-entry-modal',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, TextareaModule],
  template: `
    <p-dialog
      [header]="dialogTitle()"
      [(visible)]="visible"
      [modal]="true"
      [closable]="true"
      [style]="{ width: '32rem' }"
      (onHide)="onDialogHide()"
    >
      <div class="entry-form">
        <div class="form-field">
          <label for="entry-project">Project</label>
          <div class="project-picker">
            <button
              type="button"
              id="entry-project"
              class="project-trigger"
              [class.placeholder]="!projectId()"
              (click)="toggleProjectPicker(); $event.stopPropagation()"
            >
              {{ projectLabel() || 'Select a project' }}
            </button>
            @if (projectPickerOpen()) {
              <div class="project-dropdown" (click)="$event.stopPropagation()">
                <input
                  class="search"
                  type="text"
                  placeholder="Search projects..."
                  [ngModel]="projectSearch()"
                  (ngModelChange)="projectSearch.set($event)"
                  (click)="$event.stopPropagation()"
                />
                @for (p of filteredProjects(); track p.id) {
                  <button type="button" class="option" (click)="selectProject(p)">
                    <span class="client">{{ p.client.name }}</span>
                    {{ p.name }}
                  </button>
                } @empty {
                  <div class="empty">No projects found</div>
                }
              </div>
            }
          </div>
        </div>

        @if (projectTasks().length > 0) {
          <div class="form-field">
            <label for="entry-task">Task</label>
            <select
              id="entry-task"
              class="task-select"
              [ngModel]="taskId()"
              (ngModelChange)="taskId.set($event)"
            >
              <option value="" disabled>Select a task</option>
              @for (t of projectTasks(); track t.id) {
                <option [value]="t.id">
                  {{ t.name }} ({{ t.isBillable ? 'Billable' : 'Non-billable' }})
                </option>
              }
            </select>
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
            [ngModel]="durationInput()"
            (ngModelChange)="durationInput.set($event)"
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
    .entry-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-field label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 0.35rem;
      color: #2d2d2d;
    }

    .project-picker {
      position: relative;
    }

    .project-trigger {
      width: 100%;
      text-align: left;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      background: #fff;
      padding: 0.625rem 0.75rem;
      font-size: 14px;
      cursor: pointer;
      color: #2d2d2d;

      &.placeholder {
        color: #9aa5b1;
      }
    }

    .project-dropdown {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      z-index: 100;
      margin-top: 2px;
      background: #fff;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
      max-height: 220px;
      overflow: auto;

      input.search {
        width: 100%;
        border: none;
        border-bottom: 1px solid #e2e6ea;
        padding: 0.625rem 0.75rem;
        font-size: 14px;
        box-sizing: border-box;
      }

      button.option {
        display: block;
        width: 100%;
        text-align: left;
        border: none;
        background: none;
        padding: 0.5rem 0.75rem;
        cursor: pointer;
        font-size: 13px;

        &:hover {
          background: #fff8f3;
        }

        .client {
          color: #6b7785;
          font-size: 12px;
        }
      }

      .empty {
        padding: 0.75rem;
        color: #6b7785;
        font-size: 13px;
      }
    }

    .duration-input {
      width: 6rem;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      padding: 0.5rem 0.625rem;
      font-size: 16px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .task-select {
      width: 100%;
      border: 1px solid #e2e6ea;
      border-radius: 4px;
      background: #fff;
      padding: 0.625rem 0.75rem;
      font-size: 14px;
      color: #2d2d2d;
    }

    .error-text {
      color: #a94442;
      font-size: 13px;
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
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  visible = false;
  saving = signal(false);
  error = signal<string | null>(null);
  isEdit = signal(false);
  entryDay = signal(new Date());
  editingEntry = signal<TimeEntry | null>(null);
  projects = signal<Project[]>([]);

  projectId = signal('');
  taskId = signal('');
  notes = signal('');
  durationInput = signal('');
  projectPickerOpen = signal(false);
  projectSearch = signal('');

  readonly projectTasks = computed(() => {
    const id = this.projectId();
    const project = this.projects().find((p) => p.id === id);
    return project?.tasks ?? [];
  });

  readonly requiresTask = computed(() => this.projectTasks().length > 0);

  readonly canSubmit = computed(() => {
    if (!this.projectId()) return false;
    if (this.requiresTask() && !this.taskId()) return false;
    return true;
  });

  readonly filteredProjects = computed(() => {
    const q = this.projectSearch().trim().toLowerCase();
    const list = this.projects();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q),
    );
  });

  readonly dialogTitle = computed(() => {
    const day = formatDayHeading(this.entryDay());
    return this.isEdit() ? `Edit time entry for ${day}` : `New time entry for ${day}`;
  });

  readonly canSave = computed(() => {
    const parsed = parseDurationInput(this.durationInput());
    return parsed !== null && parsed > 0;
  });

  private resolve: ((result: TimeEntryModalResult) => void) | null = null;

  open(options: {
    day: Date;
    projects: Project[];
    entry?: TimeEntry;
  }): Promise<TimeEntryModalResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.projects.set(options.projects);
      this.entryDay.set(new Date(options.day));
      this.editingEntry.set(options.entry ?? null);
      this.isEdit.set(!!options.entry);
      this.error.set(null);
      this.projectPickerOpen.set(false);
      this.projectSearch.set('');

      if (options.entry) {
        this.projectId.set(options.entry.project.id);
        this.taskId.set(options.entry.projectTaskId ?? options.entry.projectTask?.id ?? '');
        this.notes.set(options.entry.description ?? '');
        this.durationInput.set(
          options.entry.durationMin != null
            ? formatDurationMin(options.entry.durationMin)
            : '',
        );
      } else {
        this.projectId.set('');
        this.taskId.set('');
        this.notes.set('');
        this.durationInput.set('');
      }

      this.visible = true;
    });
  }

  projectLabel(): string {
    const id = this.projectId();
    const p = this.projects().find((x) => x.id === id);
    return p ? `${p.client.name} / ${p.name}` : '';
  }

  toggleProjectPicker() {
    this.projectPickerOpen.update((v) => !v);
    if (this.projectPickerOpen()) this.projectSearch.set('');
  }

  selectProject(p: Project) {
    this.projectId.set(p.id);
    this.projectPickerOpen.set(false);
    this.projectSearch.set('');
    const tasks = p.tasks ?? [];
    this.taskId.set(tasks.length === 1 ? tasks[0].id : '');
  }

  onDialogHide() {
    this.error.set(null);
    this.projectPickerOpen.set(false);
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

  private entryPayload(projectId: string) {
    const payload: Record<string, unknown> = {
      projectId,
      description: this.notes().trim() || undefined,
    };
    const taskId = this.taskId();
    if (taskId) payload['projectTaskId'] = taskId;
    return payload;
  }

  async saveEntry() {
    const projectId = this.projectId();
    if (!projectId) {
      this.error.set('Choose a project.');
      return;
    }
    if (this.requiresTask() && !this.taskId()) {
      this.error.set('Choose a task.');
      return;
    }

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
        ? new Date(existing.startedAt)
        : this.dayStartAt();
      const stoppedAt = new Date(startedAt.getTime() + durationMin * 60_000);

      if (existing) {
        await this.api.put(`/time-entries/${existing.id}`, {
          ...this.entryPayload(projectId),
          startedAt: startedAt.toISOString(),
          stoppedAt: stoppedAt.toISOString(),
        });
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
    if (!projectId) {
      this.error.set('Choose a project.');
      return;
    }
    if (this.requiresTask() && !this.taskId()) {
      this.error.set('Choose a task.');
      return;
    }

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

    const label = `${existing.project.name} (${existing.project.client.name})`;
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

  closeProjectPicker() {
    this.projectPickerOpen.set(false);
  }
}
