import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { dueLabel, dueTone, todayKey } from '../../task-manager/core/tm-format.util';
import { TaskSummary } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';

const PREVIEW_LIMIT = 5;
const TASK_TITLE_MAX_WORDS = 8;

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}...`;
}

/** Incomplete work tasks for a project, due-date order, for the Projects side column. */
function sortTasksForPreview(tasks: TaskSummary[]): TaskSummary[] {
  const today = todayKey();
  const dueRank = (dueOn: string | null): number => {
    if (!dueOn) return 3;
    if (dueOn < today) return 0;
    if (dueOn === today) return 1;
    return 2;
  };
  return [...tasks].sort((a, b) => {
    const rank = dueRank(a.dueOn) - dueRank(b.dueOn);
    if (rank !== 0) return rank;
    if (a.dueOn && b.dueOn && a.dueOn !== b.dueOn) return a.dueOn.localeCompare(b.dueOn);
    if (a.dueOn && !b.dueOn) return -1;
    if (!a.dueOn && b.dueOn) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

@Component({
  selector: 'app-project-work-tasks-preview',
  standalone: true,
  imports: [RouterLink, ButtonModule, TmAvatarComponent, NgClass],
  styleUrl: './project-work-tasks-preview.component.scss',
  template: `
    @if (visible()) {
      <div class="card card--side project-side-card">
        <div class="card-header">
          <h3 class="card-title">Tasks</h3>
          <a
            pButton
            [routerLink]="tasksProjectLink()"
            label="Open in Tasks"
            icon="pi pi-arrow-right"
            iconPos="right"
            size="small"
            severity="secondary"
            [text]="true"
          ></a>
        </div>
        <div class="side-panel-scroll">
          @if (loading()) {
            <p class="text-color-secondary mt-0 mb-0 text-sm"><i class="pi pi-spin pi-spinner mr-2"></i>Loading…</p>
          } @else if (preview().length > 0) {
            <div class="side-list">
              @for (task of preview(); track task.id) {
                <div class="side-list-row">
                  <app-tm-avatar [person]="task.assignee" [size]="28" />
                  <div class="side-list-body">
                    <a
                      class="side-list-title"
                      [href]="taskHref(task.id)"
                      (click)="openTask(task, $event)"
                      [attr.title]="task.name"
                    >{{ taskTitle(task) }}</a>
                  </div>
                  <span class="side-list-value" [ngClass]="dueToneClass(task)">{{ dueText(task) }}</span>
                </div>
              }
            </div>
          } @else {
            <p class="side-list-empty">No open tasks.</p>
          }
        </div>
      </div>
    }
  `,
})
export class ProjectWorkTasksPreviewComponent {
  private readonly api = inject(TmApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  readonly projectId = input.required<string>();
  readonly inTaskManager = input(false);

  readonly dueLabel = dueLabel;

  loading = signal(false);
  preview = signal<TaskSummary[]>([]);

  readonly canViewTasks = computed(() => this.session.can('tasks', 'view'));
  readonly visible = computed(() => this.inTaskManager() && this.canViewTasks());
  readonly tasksProjectLink = computed(() => ['/tasks/projects', this.projectId()] as const);

  constructor() {
    effect(() => {
      const id = this.projectId();
      const show = this.visible();
      untracked(() => {
        if (!show || !id) {
          this.preview.set([]);
          return;
        }
        void this.load(id);
      });
    });
  }

  taskHref(taskId: string): string {
    const tree = this.router.createUrlTree(['/tasks/projects', this.projectId()], {
      queryParams: { task: taskId },
    });
    return this.router.serializeUrl(tree);
  }

  openTask(task: TaskSummary, event: MouseEvent) {
    event.preventDefault();
    void this.router.navigate(['/tasks/projects', this.projectId()], {
      queryParams: { task: task.id },
    });
  }

  taskTitle(task: TaskSummary): string {
    return truncateWords(task.name, TASK_TITLE_MAX_WORDS);
  }

  dueText(task: TaskSummary): string {
    return dueLabel(task.dueOn);
  }

  dueToneClass(task: TaskSummary): string {
    const tone = dueTone(task.dueOn, task.isCompleted);
    if (tone === 'none' || tone === 'normal') return '';
    return `side-list-value--${tone}`;
  }

  private async load(projectId: string) {
    this.loading.set(true);
    try {
      const tasks = await this.api.listTasks(projectId, 'incomplete');
      const sorted = sortTasksForPreview(tasks);
      this.preview.set(sorted.slice(0, PREVIEW_LIMIT));
    } catch {
      this.preview.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
