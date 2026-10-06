import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { map } from 'rxjs';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../core/tm-api.service';
import { addDaysKey, dueLabel, dueTone, todayKey } from '../core/tm-format.util';
import { MyTask, TaskSummary } from '../core/tm.types';
import { TmDueDatePickerComponent } from '../ui/due-date-picker.component';
import { TmTaskDetailComponent } from '../ui/task-detail-panel.component';
import { TmProjectIconComponent } from '../ui/tm-project-icon.component';

type Bucket = { key: string; label: string; tasks: MyTask[] };

/** Everything assigned to me across projects, bucketed by due date. Detail pane via ?task=id. */
@Component({
  selector: 'app-tm-my-tasks-page',
  standalone: true,
  imports: [TmProjectIconComponent, FormsModule, RouterLink, ButtonModule, ToggleSwitchModule, TmTaskDetailComponent, TmDueDatePickerComponent],
  template: `
    <div class="tm-page" [class.tm-with-detail]="!!taskId()">
      <header class="tm-project-header">
        <div class="tm-project-title-row">
          <span class="tm-page-icon"><i class="pi pi-check-circle"></i></span>
          <h1 class="tm-project-title">My tasks</h1>
          <div class="tm-project-header-actions">
            <label class="tm-toggle-label">
              <p-toggleswitch [ngModel]="showCompleted()" (ngModelChange)="setShowCompleted($event)" />
              Show recently completed
            </label>
          </div>
        </div>
      </header>

      @if (loading() && !tasks().length) {
        <div class="tm-page-loading"><i class="pi pi-spin pi-spinner"></i></div>
      } @else if (error()) {
        <div class="card"><p class="text-color-secondary">{{ error() }}</p></div>
      } @else {
        <div class="tm-grid tm-my-grid">
          @for (b of buckets(); track b.key) {
            @if (b.tasks.length || b.key === 'today') {
              <div class="tm-section">
                <div class="tm-section-header">
                  <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="toggle(b.key)" [attr.aria-expanded]="!collapsed().has(b.key)">
                    <i class="pi" [class.pi-chevron-down]="!collapsed().has(b.key)" [class.pi-chevron-right]="collapsed().has(b.key)"></i>
                  </button>
                  <h2 class="tm-section-name" [class.tm-overdue-heading]="b.key === 'overdue'">{{ b.label }}</h2>
                  <span class="tm-section-count">{{ b.tasks.length }}</span>
                </div>
                @if (!collapsed().has(b.key)) {
                  @for (t of b.tasks; track t.id) {
                    <div class="tm-row tm-my-row" [class.selected]="taskId() === t.id" [class.completed]="t.isCompleted" (click)="open(t)">
                      <div class="tm-grid-cell tm-row-main">
                        <button type="button" class="tm-check" [class.done]="t.isCompleted" (click)="toggleComplete(t, $event)" [attr.aria-label]="t.isCompleted ? 'Mark incomplete' : 'Mark complete'">
                          <i class="pi pi-check"></i>
                        </button>
                        <span class="tm-row-title">
                          @if (t.parent) { <span class="tm-muted">{{ t.parent.name }} ›</span> }
                          {{ t.name }}
                        </span>
                        @if (t.recurrence) { <i class="pi pi-sync tm-muted" title="Repeats"></i> }
                      </div>
                      <div class="tm-grid-cell">
                        <a class="tm-project-pill" [routerLink]="['/tasks/projects', t.project.id]" (click)="$event.stopPropagation()">
                          <app-tm-project-icon [color]="t.project.color" [icon]="t.project.icon" />{{ t.project.name }}
                        </a>
                      </div>
                      <div class="tm-grid-cell">
                        <button type="button" class="tm-cell-btn tm-due" [attr.data-tone]="dueTone(t.dueOn, t.isCompleted)" (click)="openDue($event, t)">
                          @if (t.dueOn) { {{ dueLabel(t.dueOn) }} } @else { <span class="tm-cell-placeholder"><i class="pi pi-calendar"></i></span> }
                        </button>
                      </div>
                    </div>
                  }
                  @if (b.key === 'today' && !b.tasks.length) {
                    <div class="tm-empty-row">Nothing due today 🎉</div>
                  }
                }
              </div>
            }
          }
          @if (!tasks().length) {
            <div class="tm-empty-state">
              <i class="pi pi-check-circle"></i>
              <p>No tasks assigned to you. Tasks you're assigned in any project show up here.</p>
            </div>
          }
        </div>
      }

      @if (taskId(); as tid) {
        <app-tm-task-detail
          class="tm-detail-host"
          [taskId]="tid"
          (closed)="close()"
          (changed)="onChanged($event)"
          (deleted)="onDeleted($event)"
          (openTask)="open({ id: $event })"
        />
      }
    </div>
    <app-tm-due-date-picker #duePicker (picked)="setDue($event)" />
  `,
})
export class MyTasksPage {
  private readonly api = inject(TmApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly session = inject(SessionService);

  readonly taskId = toSignal(this.route.queryParamMap.pipe(map((q) => q.get('task'))), {
    initialValue: this.route.snapshot.queryParamMap.get('task'),
  });
  tasks = signal<MyTask[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  showCompleted = signal(false);
  collapsed = signal(new Set<string>());
  private readonly duePicker = viewChild.required<TmDueDatePickerComponent>('duePicker');
  private dueTarget: MyTask | null = null;

  readonly dueLabel = dueLabel;
  readonly dueTone = dueTone;

  readonly buckets = computed<Bucket[]>(() => {
    const today = todayKey();
    const weekEnd = addDaysKey(today, 7);
    const b: Record<string, MyTask[]> = { overdue: [], today: [], upcoming: [], later: [], none: [], done: [] };
    for (const t of this.tasks()) {
      if (t.isCompleted && t.completedAt && !this.recentlyToggled.has(t.id)) b['done'].push(t);
      else if (!t.dueOn) b['none'].push(t);
      else if (t.dueOn < today) b['overdue'].push(t);
      else if (t.dueOn === today) b['today'].push(t);
      else if (t.dueOn <= weekEnd) b['upcoming'].push(t);
      else b['later'].push(t);
    }
    return [
      { key: 'overdue', label: 'Overdue', tasks: b['overdue'] },
      { key: 'today', label: 'Today', tasks: b['today'] },
      { key: 'upcoming', label: 'Next 7 days', tasks: b['upcoming'] },
      { key: 'later', label: 'Later', tasks: b['later'] },
      { key: 'none', label: 'No due date', tasks: b['none'] },
      { key: 'done', label: 'Recently completed', tasks: b['done'] },
    ];
  });

  /** Tasks completed in this session stay in place until reload (Asana behavior). */
  private recentlyToggled = new Set<string>();

  constructor() {
    effect(() => {
      this.session.me();
      untracked(() => void this.load());
    });
  }

  async load() {
    this.loading.set(true);
    try {
      this.tasks.set(await this.api.myTasks(this.showCompleted() ? 14 : 0));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load tasks');
    } finally {
      this.loading.set(false);
    }
  }

  setShowCompleted(v: boolean) {
    this.showCompleted.set(v);
    this.recentlyToggled.clear();
    void this.load();
  }

  toggle(key: string) {
    const next = new Set(this.collapsed());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.collapsed.set(next);
  }

  open(t: { id: string }) {
    void this.router.navigate([], { queryParams: { task: t.id }, queryParamsHandling: 'merge' });
  }

  close() {
    void this.router.navigate([], { queryParams: { task: null }, queryParamsHandling: 'merge' });
  }

  private patch(id: string, patch: Partial<MyTask>) {
    this.tasks.update((list) => list.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async toggleComplete(t: MyTask, event: Event) {
    event.stopPropagation();
    const next = !t.isCompleted;
    this.recentlyToggled.add(t.id);
    this.patch(t.id, { isCompleted: next, completedAt: next ? new Date().toISOString() : null });
    try {
      await this.api.updateTask(t.id, { isCompleted: next });
      if (next && t.recurrence) void this.load();
    } catch (err) {
      this.patch(t.id, { isCompleted: t.isCompleted, completedAt: t.completedAt });
      this.toast.add({ severity: 'error', summary: 'Could not update task', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  openDue(event: Event, t: MyTask) {
    event.stopPropagation();
    this.dueTarget = t;
    this.duePicker().open(event, t.dueOn);
  }

  async setDue(key: string | null) {
    const t = this.dueTarget;
    if (!t) return;
    this.patch(t.id, { dueOn: key });
    try {
      await this.api.updateTask(t.id, { dueOn: key });
    } catch (err) {
      this.patch(t.id, { dueOn: t.dueOn });
      this.toast.add({ severity: 'error', summary: 'Could not update task', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  onChanged(summary: TaskSummary) {
    const existing = this.tasks().find((t) => t.id === summary.id);
    const me = this.session.me()?.id;
    if (existing && summary.assignee?.id !== me) {
      this.tasks.update((list) => list.filter((t) => t.id !== summary.id));
    } else if (existing) {
      this.patch(summary.id, summary);
    } else {
      void this.load();
    }
  }

  onDeleted(id: string) {
    this.tasks.update((list) => list.filter((t) => t.id !== id));
  }
}
