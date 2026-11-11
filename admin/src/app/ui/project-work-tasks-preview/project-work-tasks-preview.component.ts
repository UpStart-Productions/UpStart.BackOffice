import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { todayKey } from '../../task-manager/core/tm-format.util';
import { TaskSummary } from '../../task-manager/core/tm.types';
import { WorkTasksSideListComponent } from './work-tasks-side-list.component';

const PREVIEW_LIMIT = 5;

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
  imports: [RouterLink, ButtonModule, WorkTasksSideListComponent],
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
          } @else {
            <app-work-tasks-side-list
              [tasks]="preview()"
              [taskProjectId]="projectId()"
              taskOpenTarget="project-board"
              [showProjectLink]="false"
              emptyText="No open tasks."
            />
          }
        </div>
      </div>
    }
  `,
})
export class ProjectWorkTasksPreviewComponent {
  private readonly api = inject(TmApiService);
  private readonly session = inject(SessionService);

  readonly projectId = input.required<string>();
  readonly inTaskManager = input(false);

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
