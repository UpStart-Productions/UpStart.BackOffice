import { NgClass } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { dueLabel, dueTone } from '../../task-manager/core/tm-format.util';
import { MyTask, TaskSummary } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';

const TASK_TITLE_MAX_WORDS = 8;

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}...`;
}

export type WorkTaskSideListItem = TaskSummary & {
  project?: { id: string; name: string };
};

function projectOf(task: WorkTaskSideListItem): { id: string; name: string } | null {
  const p = (task as MyTask).project ?? task.project;
  return p?.id ? { id: p.id, name: p.name } : null;
}

/** Canonical side-list rows for open work tasks (dashboard My tasks, project Tasks panel). */
@Component({
  selector: 'app-work-tasks-side-list',
  standalone: true,
  imports: [RouterLink, TmAvatarComponent, NgClass],
  styleUrl: './project-work-tasks-preview.component.scss',
  template: `
    @if (tasks().length > 0) {
      <div class="side-list">
        @for (task of tasks(); track task.id) {
          <div class="side-list-row">
            @if (showAssignee()) {
              <app-tm-avatar [person]="task.assignee" size="med" />
            }
            <div class="side-list-body">
              <a
                class="side-list-title"
                [href]="taskHref(task)"
                (click)="openTask(task, $event)"
                [attr.title]="task.name"
              >{{ taskTitle(task) }}</a>
              @if (showProjectLink()) {
                @if (projectOf(task); as proj) {
                  <a class="side-list-detail" [routerLink]="['/projects', proj.id]">{{ proj.name }}</a>
                }
              }
            </div>
            <span class="side-list-value" [ngClass]="dueToneClass(task)">{{ dueText(task) }}</span>
          </div>
        }
      </div>
    } @else if (emptyText()) {
      <p class="side-list-empty">{{ emptyText() }}</p>
    }
  `,
})
export class WorkTasksSideListComponent {
  private readonly router = inject(Router);

  /** Rows to render (caller filters/sorts). */
  readonly tasks = input.required<WorkTaskSideListItem[]>();
  /** Opens the task on My tasks or on a project board (default board = `taskProjectId` or the task's home project). */
  readonly taskOpenTarget = input<'my-tasks' | 'project-board'>('project-board');
  readonly taskProjectId = input<string | null>(null);
  readonly showProjectLink = input(false);
  readonly showAssignee = input(true);
  readonly emptyText = input<string | null>(null);

  readonly projectOf = projectOf;

  taskTitle(task: WorkTaskSideListItem): string {
    return truncateWords(task.name, TASK_TITLE_MAX_WORDS);
  }

  dueText(task: WorkTaskSideListItem): string {
    return dueLabel(task.dueOn);
  }

  dueToneClass(task: WorkTaskSideListItem): string {
    const tone = dueTone(task.dueOn, task.isCompleted);
    if (tone === 'none' || tone === 'normal') return '';
    return `side-list-value--${tone}`;
  }

  taskHref(task: WorkTaskSideListItem): string {
    const tree =
      this.taskOpenTarget() === 'my-tasks'
        ? this.router.createUrlTree(['/tasks'], { queryParams: { task: task.id } })
        : this.router.createUrlTree(['/tasks/projects', this.boardProjectId(task)], {
            queryParams: { task: task.id },
          });
    return this.router.serializeUrl(tree);
  }

  openTask(task: WorkTaskSideListItem, event: MouseEvent) {
    event.preventDefault();
    if (this.taskOpenTarget() === 'my-tasks') {
      void this.router.navigate(['/tasks'], { queryParams: { task: task.id } });
      return;
    }
    void this.router.navigate(['/tasks/projects', this.boardProjectId(task)], {
      queryParams: { task: task.id },
    });
  }

  private boardProjectId(task: WorkTaskSideListItem): string {
    return this.taskProjectId() ?? task.projectId;
  }
}
