import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { Popover, PopoverModule } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';
import { TmApiService } from '../core/tm-api.service';
import { TmStoreService } from '../core/tm-store.service';
import { TaskMembership, TmProjectListItem, TmSection } from '../core/tm.types';
import { TmProjectIconComponent } from './tm-project-icon.component';

type Mode = 'section' | 'move' | 'add';

/**
 * Asana-style "Projects" block in the task detail pane: every project the task is in, each with a
 * section dropdown (move to section / move to another project), plus "+" to add the task to another
 * project and "×" to remove it from one.
 */
@Component({
  selector: 'app-tm-task-projects',
  standalone: true,
  imports: [FormsModule, RouterLink, PopoverModule, TooltipModule, TmProjectIconComponent],
  template: `
    <div class="tm-memberships">
      @for (m of projects(); track m.id) {
        <div class="tm-membership">
          <a class="tm-project-pill" [routerLink]="['/tasks/projects', m.id]">
            <app-tm-project-icon [color]="m.color" [icon]="m.icon" />
            <span class="tm-membership-name">{{ m.name }}</span>
          </a>
          @if (!isSubtask()) {
            <button type="button" class="tm-section-btn" (click)="openSections($event, m)" [disabled]="!canEdit()" [attr.aria-label]="'Section in ' + m.name">
              <span>{{ m.section?.name ?? 'No section' }}</span>
              @if (canEdit()) { <i class="pi pi-chevron-down"></i> }
            </button>
            @if (canEdit() && projects().length > 1) {
              <button type="button" class="tm-icon-btn tm-icon-btn-sm tm-membership-remove" (click)="remove(m)" [pTooltip]="'Remove from ' + m.name" [attr.aria-label]="'Remove from ' + m.name">
                <i class="pi pi-times"></i>
              </button>
            }
          }
        </div>
      }
      @if (canEdit() && !isSubtask()) {
        <button type="button" class="tm-link-btn tm-membership-add" (click)="openAdd($event)"><i class="pi pi-plus"></i> Add to project</button>
      }
    </div>

    <p-popover #pop appendTo="body" styleClass="tm-popover" (onHide)="reset()">
      <div class="tm-picker">
        @if (step() === 'project') {
          <div class="tm-menu-label">{{ mode() === 'add' ? 'Add to project' : 'Move to project' }}</div>
          <input
            class="tm-picker-search"
            type="text"
            placeholder="Find a project"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
            (keydown.escape)="pop.hide()"
            aria-label="Find a project"
          />
          <ul class="tm-picker-list">
            @for (p of projectChoices(); track p.id) {
              <li>
                <button type="button" class="tm-picker-item" (click)="chooseProject(p)">
                  <app-tm-project-icon [color]="p.color" [icon]="p.icon" />
                  <span class="tm-picker-name">{{ p.name }}</span>
                </button>
              </li>
            } @empty {
              <li class="tm-picker-empty">No other projects</li>
            }
          </ul>
        } @else {
          <div class="tm-menu-label">
            @if (mode() !== 'section') {
              <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="step.set('project')" aria-label="Back to projects"><i class="pi pi-arrow-left"></i></button>
            }
            Select section{{ mode() !== 'section' ? ' in ' + (target()?.name ?? '') : '' }}
          </div>
          <ul class="tm-picker-list">
            @if (loadingSections()) {
              <li class="tm-picker-empty"><i class="pi pi-spin pi-spinner"></i></li>
            }
            @for (s of sections(); track s.id) {
              <li>
                <button type="button" class="tm-picker-item" [class.selected]="mode() === 'section' && s.id === current()?.section?.id" (click)="chooseSection(s)">
                  <i class="pi" [class.pi-check]="mode() === 'section' && s.id === current()?.section?.id" [class.tm-check-spacer]="!(mode() === 'section' && s.id === current()?.section?.id)"></i>
                  <span>{{ s.name }}</span>
                </button>
              </li>
            }
          </ul>
          @if (mode() === 'section') {
            <hr />
            <button type="button" class="tm-picker-item" (click)="startMove()"><i class="pi pi-arrow-right-arrow-left"></i> Move to another project…</button>
          }
        }
      </div>
    </p-popover>
  `,
})
export class TmTaskProjectsComponent {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  private readonly toast = inject(MessageService);

  taskId = input.required<string>();
  projects = input.required<TaskMembership[]>();
  canEdit = input(false);
  isSubtask = input(false);
  /** Memberships changed (moved / added / removed) — reload the task and any list showing it. */
  changed = output<void>();

  private readonly pop = viewChild.required<Popover>('pop');
  mode = signal<Mode>('section');
  step = signal<'project' | 'section'>('section');
  current = signal<TaskMembership | null>(null);
  target = signal<TmProjectListItem | TaskMembership | null>(null);
  sections = signal<TmSection[]>([]);
  loadingSections = signal(false);
  query = signal('');
  private sectionCache = new Map<string, Promise<TmSection[]>>();

  readonly projectChoices = computed(() => {
    const taken = new Set(this.projects().map((m) => m.id));
    const q = this.query().trim().toLowerCase();
    return this.store
      .projects()
      .filter((p) => p.isActive && !taken.has(p.id) && (!q || p.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  async openSections(event: Event, m: TaskMembership) {
    if (!this.canEdit()) return;
    this.mode.set('section');
    this.step.set('section');
    this.current.set(m);
    this.target.set(m);
    this.pop().toggle(event);
    await this.loadSections(m.id);
  }

  async openAdd(event: Event) {
    this.mode.set('add');
    this.step.set('project');
    this.current.set(null);
    this.pop().toggle(event);
    if (!this.store.projectsLoaded()) await this.store.loadProjects();
  }

  async startMove() {
    this.mode.set('move');
    this.step.set('project');
    if (!this.store.projectsLoaded()) await this.store.loadProjects();
  }

  async chooseProject(p: TmProjectListItem) {
    this.target.set(p);
    this.step.set('section');
    await this.loadSections(p.id);
  }

  async chooseSection(s: TmSection) {
    const mode = this.mode();
    const from = this.current();
    const target = this.target();
    this.pop().hide();
    if (!target) return;
    try {
      if (mode === 'section') {
        if (!from || s.id === from.section?.id) return;
        await this.api.moveTask(this.taskId(), { sectionId: s.id, fromProjectId: from.id });
      } else if (mode === 'move') {
        if (!from) return;
        await this.api.moveTask(this.taskId(), { projectId: target.id, sectionId: s.id, fromProjectId: from.id });
        this.toast.add({ severity: 'success', summary: `Moved to ${target.name}`, life: 2500 });
      } else {
        await this.api.addTaskProject(this.taskId(), target.id, s.id);
        this.toast.add({ severity: 'success', summary: `Added to ${target.name}`, life: 2500 });
      }
      this.changed.emit();
    } catch (err) {
      this.fail(err);
    }
  }

  async remove(m: TaskMembership) {
    try {
      await this.api.removeTaskProject(this.taskId(), m.id);
      this.changed.emit();
    } catch (err) {
      this.fail(err);
    }
  }

  reset() {
    this.query.set('');
  }

  private async loadSections(projectId: string) {
    this.sections.set([]);
    this.loadingSections.set(true);
    try {
      if (!this.sectionCache.has(projectId)) {
        this.sectionCache.set(
          projectId,
          this.api.getProject(projectId).then((p) => [...p.sections].sort((a, b) => a.sortOrder - b.sortOrder)),
        );
      }
      const list = await this.sectionCache.get(projectId)!;
      if (this.target()?.id === projectId) this.sections.set(list);
    } catch (err) {
      this.sectionCache.delete(projectId);
      this.fail(err);
    } finally {
      this.loadingSections.set(false);
    }
  }

  private fail(err: unknown) {
    this.toast.add({ severity: 'error', summary: 'Something went wrong', detail: err instanceof Error ? err.message : String(err) });
  }
}
