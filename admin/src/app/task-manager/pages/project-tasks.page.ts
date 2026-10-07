import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { Component, computed, effect, HostListener, inject, OnDestroy, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { Popover, PopoverModule } from 'primeng/popover';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';
import { filter, map } from 'rxjs';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TmApiService } from '../core/tm-api.service';
import { chipColors, dueLabel, dueTone, PROJECT_COLORS } from '../core/tm-format.util';
import { TmStoreService } from '../core/tm-store.service';
import { Person, TaskSummary, TmProject, TmSection } from '../core/tm.types';
import { TmBulkActionsComponent } from '../ui/bulk-actions.component';
import { TmDueDatePickerComponent } from '../ui/due-date-picker.component';
import { TmFieldCellComponent } from '../ui/field-cell.component';
import { TmFieldsDialogComponent } from '../ui/fields-dialog.component';
import { TmMembersDialogComponent } from '../ui/members-dialog.component';
import { TmPersonPickerComponent } from '../ui/person-picker.component';
import { TmTaskDetailComponent } from '../ui/task-detail-panel.component';
import { TmAvatarComponent } from '../ui/tm-avatar.component';
import { TagPick, TmTagPickerComponent } from '../ui/tag-picker.component';
import { LucideIconComponent, LucideIconPickerPanelComponent } from '@upstart/back-office/lucide-icons';

type CompletedFilter = 'incomplete' | 'all' | 'completed';
type Group = { section: TmSection | null; tasks: TaskSummary[] };

const NO_SECTION = '__none__';

/** Asana-style list view of a project's tasks, grouped by section, with a right-hand detail pane. */
@Component({
  selector: 'app-tm-project-tasks-page',
  standalone: true,
  imports: [LucideIconComponent, LucideIconPickerPanelComponent, 
    FormsModule,
    RouterLink,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PopoverModule,
    SelectButtonModule,
    MultiSelectModule,
    TmTagPickerComponent,
    TooltipModule,
    CdkDropListGroup,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    TmAvatarComponent,
    TmPersonPickerComponent,
    TmDueDatePickerComponent,
    TmFieldCellComponent,
    TmTaskDetailComponent,
    TmMembersDialogComponent,
    TmFieldsDialogComponent,
    TmBulkActionsComponent,
  ],
  templateUrl: './project-tasks.page.html',
})
export class ProjectTasksPage implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TmApiService);
  readonly store = inject(TmStoreService);
  private readonly confirm = inject(ConfirmationService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);

  readonly projectId = toSignal(this.route.paramMap.pipe(map((p) => p.get('projectId')!)), {
    initialValue: this.route.snapshot.paramMap.get('projectId')!,
  });
  readonly taskId = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.childTaskId()),
    ),
    { initialValue: this.childTaskId() },
  );

  project = signal<TmProject | null>(null);
  tasks = signal<TaskSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  people = signal<Person[]>([]);
  completedFilter = signal<CompletedFilter>('incomplete');
  search = signal('');
  tagFilter = signal<string[]>([]);
  membersOpen = signal(false);
  fieldsOpen = signal(false);
  addingIn = signal<string | null>(null);
  newTaskName = '';
  editingSectionId = signal<string | null>(null);
  sectionDraft = '';
  newSectionName = '';
  addingSection = signal(false);
  selectedIds = signal<Set<string>>(new Set());
  private selectionAnchorId: string | null = null;

  readonly filterOptions = [
    { label: 'Incomplete', value: 'incomplete' },
    { label: 'Completed', value: 'completed' },
    { label: 'All', value: 'all' },
  ];
  readonly colors = PROJECT_COLORS;
  readonly dueLabel = dueLabel;
  readonly dueTone = dueTone;
  readonly chipColors = chipColors;
  readonly NO_SECTION = NO_SECTION;

  private readonly assigneePicker = viewChild.required<TmPersonPickerComponent>('assigneePicker');
  private readonly duePicker = viewChild.required<TmDueDatePickerComponent>('duePicker');
  private readonly tagPicker = viewChild.required<TmTagPickerComponent>('tagPicker');
  private readonly sectionMenu = viewChild.required<Popover>('sectionMenu');
  private readonly colorMenu = viewChild.required<Popover>('colorMenu');
  private readonly projectMenu = viewChild.required<Popover>('projectMenu');
  private readonly bulkSectionPop = viewChild.required<Popover>('bulkSectionPop');
  private pickerTask: TaskSummary | null = null;
  private bulkPickerIds: string[] | null = null;
  menuSection: TmSection | null = null;
  private loadSeq = 0;

  readonly canEdit = computed(() => !!this.project()?.permissions.canEdit);
  readonly fields = computed(() => this.project()?.customFields ?? []);
  readonly gridTemplate = computed(() => {
    const fieldCols = this.fields().map(() => 'minmax(120px, 150px)').join(' ');
    return `minmax(280px, 1fr) 150px 120px 180px ${fieldCols} ${this.canEdit() ? '44px' : ''}`.trim();
  });

  /** Shared minimum row width (sum of column minimums). Every row gets the same width so the
   *  `1fr` name column resolves identically and columns stay aligned when the grid is squeezed
   *  (e.g. detail pane open) — `max-content` let each row size to its own content. */
  readonly gridMinWidth = computed(() => 280 + 150 + 120 + 180 + this.fields().length * 120 + (this.canEdit() ? 44 : 0));

  readonly groups = computed<Group[]>(() => {
    const project = this.project();
    if (!project) return [];
    const q = this.search().trim().toLowerCase();
    const filter = this.completedFilter();
    const tagIds = this.tagFilter();
    const visible = this.tasks().filter((t) => {
      if (q && !t.name.toLowerCase().includes(q)) return false;
      if (tagIds.length && !t.tags.some((tag) => tagIds.includes(tag.id))) return false;
      if (filter === 'completed') return t.isCompleted;
      return true; // 'incomplete' keeps just-completed tasks visible until reload (Asana behavior)
    });
    const bySection = new Map<string, TaskSummary[]>();
    for (const t of visible) {
      const key = t.sectionId ?? NO_SECTION;
      if (!bySection.has(key)) bySection.set(key, []);
      bySection.get(key)!.push(t);
    }
    for (const list of bySection.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    const groups: Group[] = [];
    const orphans = bySection.get(NO_SECTION);
    if (orphans?.length) groups.push({ section: null, tasks: orphans });
    for (const s of [...project.sections].sort((a, b) => a.sortOrder - b.sortOrder)) {
      groups.push({ section: s, tasks: bySection.get(s.id) ?? [] });
    }
    return groups;
  });

  readonly dropListIds = computed(() => this.groups().map((g) => this.dropId(g)));
  readonly visibleTaskOrder = computed(() => this.groups().flatMap((g) => g.tasks.map((t) => t.id)));
  readonly selectedCount = computed(() => this.selectedIds().size);
  readonly sortedSections = computed(() =>
    [...(this.project()?.sections ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
  );

  constructor() {
    effect(() => {
      const id = this.projectId();
      untracked(() => void this.load(id));
    });
    void this.store.loadTags();
  }

  ngOnDestroy() {
    this.loadSeq++;
  }

  private childTaskId(): string | null {
    return this.route.snapshot.firstChild?.paramMap.get('taskId') ?? null;
  }

  dropId(g: Group): string {
    return `tm-section-${g.section?.id ?? NO_SECTION}`;
  }

  async load(projectId: string, quiet = false) {
    const seq = ++this.loadSeq;
    if (!quiet) {
      this.loading.set(true);
      this.error.set(null);
    }
    try {
      const [project, tasks] = await Promise.all([
        this.api.getProject(projectId),
        this.api.listTasks(projectId, this.completedFilter()),
      ]);
      if (seq !== this.loadSeq) return;
      this.project.set(project);
      this.tasks.set(tasks);
      this.store.people(projectId).then((p) => this.people.set(p)).catch(() => undefined);
    } catch (err) {
      if (seq === this.loadSeq) this.error.set(err instanceof Error ? err.message : 'Could not load project');
    } finally {
      if (seq === this.loadSeq) this.loading.set(false);
    }
  }

  setFilter(value: CompletedFilter) {
    this.completedFilter.set(value);
    this.clearSelection();
    void this.load(this.projectId(), true);
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.selectedCount() > 0) {
      this.clearSelection();
    }
  }

  isBulkSelected(id: string) {
    return this.selectedIds().has(id);
  }

  clearSelection() {
    this.selectedIds.set(new Set());
    this.selectionAnchorId = null;
  }

  /** Plain click: one selected row, detail open — keeps anchor for Shift/Ctrl extend. */
  private selectSingle(task: TaskSummary) {
    this.selectedIds.set(new Set([task.id]));
    this.selectionAnchorId = task.id;
    this.openTask(task);
  }

  /** Title column click (not the name field): select/open, or Shift/Ctrl/Cmd multi-select. */
  onTitleColumnClick(task: TaskSummary, event: MouseEvent) {
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, .tm-drag-handle')) return;
    this.onRowClick(task, event);
  }

  /** Title field click: open/select, then focus for inline rename. */
  onTitleClick(task: TaskSummary, event: MouseEvent, input: HTMLInputElement) {
    event.stopPropagation();
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    if (multi && this.canEdit()) {
      this.onRowClick(task, event);
      return;
    }
    this.selectSingle(task);
    if (this.canEdit()) {
      input.focus();
      input.select();
    }
  }

  /** Shift/Ctrl/Cmd multi-select; plain click selects one and opens the detail pane. */
  private onRowClick(task: TaskSummary, event: MouseEvent) {
    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    if (!this.canEdit() || !multi) {
      this.selectSingle(task);
      return;
    }

    event.preventDefault();

    if (event.shiftKey && this.selectionAnchorId) {
      const order = this.visibleTaskOrder();
      const anchorIdx = order.indexOf(this.selectionAnchorId);
      const currentIdx = order.indexOf(task.id);
      if (anchorIdx >= 0 && currentIdx >= 0) {
        const [lo, hi] = anchorIdx < currentIdx ? [anchorIdx, currentIdx] : [currentIdx, anchorIdx];
        const range = order.slice(lo, hi + 1);
        this.selectedIds.update((s) => new Set([...s, ...range]));
      }
      this.selectionAnchorId = task.id;
    } else {
      this.selectedIds.update((s) => {
        const next = new Set(s);
        if (next.has(task.id)) next.delete(task.id);
        else next.add(task.id);
        return next;
      });
      this.selectionAnchorId = task.id;
    }
  }

  private selectedTasksInOrder(): TaskSummary[] {
    const ids = new Set(this.selectedIds());
    const byId = new Map(this.tasks().map((t) => [t.id, t]));
    return this.visibleTaskOrder()
      .filter((id) => ids.has(id))
      .map((id) => byId.get(id)!)
      .filter(Boolean);
  }

  openBulkAssign(event: Event) {
    this.bulkPickerIds = [...this.selectedIds()];
    this.assigneePicker().open(event, this.people(), null);
  }

  openBulkDue(event: Event) {
    this.bulkPickerIds = [...this.selectedIds()];
    this.duePicker().open(event, null);
  }

  openBulkMove(event: Event) {
    this.bulkSectionPop().toggle(event);
  }

  async bulkMoveToSection(sectionId: string | null) {
    this.bulkSectionPop().hide();
    const tasks = this.selectedTasksInOrder();
    if (!tasks.length) return;
    let afterId: string | null = null;
    try {
      for (const task of tasks) {
        const updated = await this.api.moveTask(task.id, {
          sectionId,
          afterTaskId: afterId,
          fromProjectId: this.projectId(),
        });
        this.patchLocal(task.id, updated);
        afterId = task.id;
      }
      this.toast.add({ severity: 'success', summary: `Moved ${tasks.length} task${tasks.length === 1 ? '' : 's'}`, life: 2500 });
      this.clearSelection();
    } catch (err) {
      this.fail(err);
      void this.load(this.projectId(), true);
    }
  }

  async bulkMarkComplete() {
    const tasks = this.selectedTasksInOrder().filter((t) => !t.isCompleted);
    if (!tasks.length) return;
    for (const task of tasks) this.patchLocal(task.id, { isCompleted: true });
    try {
      await Promise.all(tasks.map((t) => this.api.updateTask(t.id, { isCompleted: true })));
      this.toast.add({ severity: 'success', summary: `Completed ${tasks.length} task${tasks.length === 1 ? '' : 's'}`, life: 2500 });
      this.clearSelection();
      if (tasks.some((t) => t.recurrence)) void this.load(this.projectId(), true);
    } catch (err) {
      this.fail(err);
      void this.load(this.projectId(), true);
    }
  }

  confirmBulkDelete() {
    const n = this.selectedCount();
    if (!n) return;
    this.confirmDelete.confirm({
      message: `Delete ${n} task${n === 1 ? '' : 's'}? This cannot be undone.`,
      accept: () => this.bulkDelete(),
    });
  }

  private async bulkDelete() {
    const tasks = this.selectedTasksInOrder();
    if (!tasks.length) return;
    const ids = new Set(tasks.map((t) => t.id));
    this.tasks.update((list) => list.filter((t) => !ids.has(t.id)));
    this.clearSelection();
    if (this.taskId() && ids.has(this.taskId()!)) void this.closeTask();
    try {
      await Promise.all(tasks.map((t) => this.api.deleteTask(t.id)));
      this.bumpOpenCount(-tasks.filter((t) => !t.isCompleted).length);
      this.toast.add({ severity: 'success', summary: `Deleted ${tasks.length} task${tasks.length === 1 ? '' : 's'}`, life: 2500 });
    } catch (err) {
      this.fail(err);
      void this.load(this.projectId(), true);
    }
  }

  private fail(err: unknown) {
    this.toast.add({ severity: 'error', summary: 'Something went wrong', detail: err instanceof Error ? err.message : String(err) });
  }

  /** True when the row is a task from another project that's also listed here. */
  isLinked(t: TaskSummary): boolean {
    return t.projectId !== this.projectId();
  }

  private patchLocal(id: string, patch: Partial<TaskSummary>) {
    this.tasks.update((list) =>
      list.map((t) => {
        if (t.id !== id) return t;
        // Server summaries carry the task's home-project section/position; a linked row keeps its own.
        if (this.isLinked(t) && patch.projectId !== undefined) {
          const { sectionId: _s, sortOrder: _o, ...rest } = patch;
          return { ...t, ...rest };
        }
        return { ...t, ...patch };
      }),
    );
  }

  onProjectsChanged() {
    void this.load(this.projectId(), true);
  }

  // ── Tags ────────────────────────────────────────────────────────────────

  openTags(event: Event, task: TaskSummary) {
    event.stopPropagation();
    if (!this.canEdit()) return;
    this.pickerTask = task;
    this.tagPicker().open(event, task.tags);
  }

  async addTag(pick: TagPick) {
    const task = this.pickerTask;
    if (!task) return;
    try {
      const tags = await this.api.addTaskTag(task.id, pick);
      this.store.rememberTags(tags);
      this.patchLocal(task.id, { tags });
    } catch (err) {
      this.fail(err);
    }
  }

  async removeTag(event: Event, task: TaskSummary, tagId: string) {
    event.stopPropagation();
    this.patchLocal(task.id, { tags: task.tags.filter((t) => t.id !== tagId) });
    try {
      this.patchLocal(task.id, { tags: await this.api.removeTaskTag(task.id, tagId) });
    } catch (err) {
      this.fail(err);
    }
  }

  // ── Detail pane ─────────────────────────────────────────────────────────

  openTask(task: { id: string }) {
    void this.router.navigate(['/tasks/projects', this.projectId(), 'tasks', task.id]);
  }

  closeTask() {
    void this.router.navigate(['/tasks/projects', this.projectId()]);
  }

  onDetailChanged(summary: TaskSummary) {
    if (summary.parentTaskId) {
      // A subtask changed — refresh the parent's counts.
      void this.load(this.projectId(), true);
      return;
    }
    if (this.tasks().some((t) => t.id === summary.id)) {
      this.patchLocal(summary.id, summary);
    } else if (summary.projectId === this.projectId()) {
      void this.load(this.projectId(), true);
    }
    // Recurring tasks spawn a new instance when completed.
    if (summary.isCompleted && summary.recurrence) void this.load(this.projectId(), true);
  }

  onDetailDeleted(id: string) {
    this.tasks.update((list) => list.filter((t) => t.id !== id));
  }

  // ── Rows ────────────────────────────────────────────────────────────────

  async toggleComplete(task: TaskSummary, event?: Event) {
    event?.stopPropagation();
    if (!this.canEdit()) return;
    const next = !task.isCompleted;
    this.patchLocal(task.id, { isCompleted: next });
    try {
      const updated = await this.api.updateTask(task.id, { isCompleted: next });
      this.patchLocal(task.id, updated);
      if (next && task.recurrence) {
        await this.load(this.projectId(), true);
        this.toast.add({ severity: 'info', summary: 'Repeating task', detail: 'The next occurrence was created.', life: 3000 });
      }
    } catch (err) {
      this.patchLocal(task.id, { isCompleted: task.isCompleted });
      this.fail(err);
    }
  }

  async renameTask(task: TaskSummary, name: string) {
    const next = name.trim();
    if (!next || next === task.name) return;
    this.patchLocal(task.id, { name: next });
    try {
      await this.api.updateTask(task.id, { name: next });
    } catch (err) {
      this.patchLocal(task.id, { name: task.name });
      this.fail(err);
    }
  }

  onNameKey(event: KeyboardEvent, task: TaskSummary, group: Group) {
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
      // Enter on a row adds a new task right below it (Asana).
      if (this.canEdit()) void this.createTask(group, '', task.id);
    } else if (event.key === 'Escape') {
      input.value = task.name;
      input.blur();
    }
  }

  openAssignee(event: Event, task: TaskSummary) {
    event.stopPropagation();
    if (!this.canEdit()) return;
    this.pickerTask = task;
    this.assigneePicker().open(event, this.people(), task.assignee?.id ?? null);
  }

  async setAssignee(person: Person | null) {
    const bulkIds = this.bulkPickerIds;
    if (bulkIds?.length) {
      this.bulkPickerIds = null;
      for (const id of bulkIds) this.patchLocal(id, { assignee: person });
      try {
        await Promise.all(bulkIds.map((id) => this.api.updateTask(id, { assigneeId: person?.id ?? null })));
        this.toast.add({
          severity: 'success',
          summary: `Updated ${bulkIds.length} task${bulkIds.length === 1 ? '' : 's'}`,
          life: 2500,
        });
        this.clearSelection();
      } catch (err) {
        this.fail(err);
        void this.load(this.projectId(), true);
      }
      return;
    }
    const task = this.pickerTask;
    if (!task) return;
    this.patchLocal(task.id, { assignee: person });
    try {
      await this.api.updateTask(task.id, { assigneeId: person?.id ?? null });
    } catch (err) {
      this.patchLocal(task.id, { assignee: task.assignee });
      this.fail(err);
    }
  }

  openDue(event: Event, task: TaskSummary) {
    event.stopPropagation();
    if (!this.canEdit()) return;
    this.pickerTask = task;
    this.duePicker().open(event, task.dueOn);
  }

  async setDue(key: string | null) {
    const bulkIds = this.bulkPickerIds;
    if (bulkIds?.length) {
      this.bulkPickerIds = null;
      for (const id of bulkIds) this.patchLocal(id, { dueOn: key });
      try {
        await Promise.all(bulkIds.map((id) => this.api.updateTask(id, { dueOn: key })));
        this.toast.add({
          severity: 'success',
          summary: `Updated ${bulkIds.length} task${bulkIds.length === 1 ? '' : 's'}`,
          life: 2500,
        });
        this.clearSelection();
      } catch (err) {
        this.fail(err);
        void this.load(this.projectId(), true);
      }
      return;
    }
    const task = this.pickerTask;
    if (!task) return;
    this.patchLocal(task.id, { dueOn: key });
    try {
      await this.api.updateTask(task.id, { dueOn: key });
    } catch (err) {
      this.patchLocal(task.id, { dueOn: task.dueOn });
      this.fail(err);
    }
  }

  async setField(task: TaskSummary, fieldId: string, value: unknown) {
    const before = task.fields;
    const nextFields = { ...task.fields };
    if (value === null) delete nextFields[fieldId];
    else nextFields[fieldId] = value;
    this.patchLocal(task.id, { fields: nextFields });
    try {
      await this.api.setField(task.id, fieldId, value);
    } catch (err) {
      this.patchLocal(task.id, { fields: before });
      this.fail(err);
    }
  }

  // ── Create ──────────────────────────────────────────────────────────────

  startAdd(group: Group) {
    this.addingIn.set(group.section?.id ?? NO_SECTION);
    this.newTaskName = '';
    setTimeout(() => (document.querySelector('.tm-row-new input') as HTMLInputElement | null)?.focus(), 0);
  }

  /** Toolbar "Add task": new task at the top of the first section, then open it. */
  async addTaskTop() {
    const first = this.groups().find((g) => g.section) ?? this.groups()[0];
    if (!first) return;
    const created = await this.createTask(first, 'New task', null);
    if (created) this.openTask(created);
  }

  async submitNew(group: Group) {
    const name = this.newTaskName.trim();
    if (!name) {
      this.addingIn.set(null);
      return;
    }
    this.newTaskName = '';
    const last = group.tasks[group.tasks.length - 1]?.id;
    await this.createTask(group, name, last ?? null);
    setTimeout(() => (document.querySelector('.tm-row-new input') as HTMLInputElement | null)?.focus(), 0);
  }

  private async createTask(group: Group, name: string, afterTaskId: string | null): Promise<TaskSummary | null> {
    try {
      const created = await this.api.createTask({
        projectId: this.projectId(),
        sectionId: group.section?.id ?? null,
        name: name || 'Untitled task',
        afterTaskId,
      });
      this.tasks.update((list) => [...list, created]);
      this.bumpOpenCount(1);
      if (!name) {
        setTimeout(() => {
          const el = document.querySelector(`[data-task-id="${created.id}"] .tm-row-name`) as HTMLInputElement | null;
          el?.focus();
          el?.select();
        }, 0);
      }
      return created;
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private bumpOpenCount(delta: number) {
    const p = this.store.projects().find((x) => x.id === this.projectId());
    if (p) this.store.patchProject(p.id, { openTaskCount: Math.max(0, p.openTaskCount + delta) });
  }

  // ── Drag & drop ─────────────────────────────────────────────────────────

  async onDrop(event: CdkDragDrop<Group>) {
    const task = event.item.data as TaskSummary;
    const target = event.container.data;
    const sameList = event.previousContainer === event.container;
    if (sameList && event.previousIndex === event.currentIndex) return;
    const siblings = target.tasks.filter((t) => t.id !== task.id);
    const after = event.currentIndex > 0 ? siblings[event.currentIndex - 1] : null;
    const before = siblings[event.currentIndex] ?? null;
    // Optimistic sort order between neighbours.
    const lo = after?.sortOrder ?? (before ? before.sortOrder - 1024 : 0);
    const hi = before?.sortOrder ?? lo + 2048;
    this.patchLocal(task.id, { sectionId: target.section?.id ?? null, sortOrder: (lo + hi) / 2 });
    try {
      const updated = await this.api.moveTask(task.id, {
        sectionId: target.section?.id ?? null,
        afterTaskId: after?.id ?? null,
        fromProjectId: this.projectId(),
      });
      this.patchLocal(task.id, updated);
    } catch (err) {
      this.fail(err);
      void this.load(this.projectId(), true);
    }
  }

  // ── Sections ────────────────────────────────────────────────────────────

  async toggleCollapse(section: TmSection) {
    const next = !section.isCollapsed;
    this.patchSection(section.id, { isCollapsed: next });
    try {
      await this.api.updateSection(section.id, { isCollapsed: next });
    } catch {
      /* collapse state is cosmetic */
    }
  }

  private patchSection(id: string, patch: Partial<TmSection>) {
    const p = this.project();
    if (!p) return;
    this.project.set({ ...p, sections: p.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  openSectionMenu(event: Event, section: TmSection) {
    this.menuSection = section;
    this.sectionMenu().toggle(event);
  }

  startRenameSection(section: TmSection | null = this.menuSection) {
    if (!section || !this.canEdit()) return;
    this.sectionMenu().hide();
    this.editingSectionId.set(section.id);
    this.sectionDraft = section.name;
    setTimeout(() => (document.querySelector('.tm-section-rename') as HTMLInputElement | null)?.select(), 0);
  }

  async saveSectionName(section: TmSection) {
    const next = this.sectionDraft.trim();
    this.editingSectionId.set(null);
    if (!next || next === section.name) return;
    this.patchSection(section.id, { name: next });
    try {
      await this.api.updateSection(section.id, { name: next });
    } catch (err) {
      this.patchSection(section.id, { name: section.name });
      this.fail(err);
    }
  }

  async moveSection(direction: -1 | 1) {
    const section = this.menuSection;
    const p = this.project();
    this.sectionMenu().hide();
    if (!section || !p) return;
    const sorted = [...p.sections].sort((a, b) => a.sortOrder - b.sortOrder);
    const index = sorted.findIndex((s) => s.id === section.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;
    const without = sorted.filter((s) => s.id !== section.id);
    const afterId = targetIndex === 0 ? null : without[targetIndex - 1].id;
    try {
      const res = await this.api.moveSection(section.id, afterId);
      this.patchSection(section.id, { sortOrder: res.sortOrder });
    } catch (err) {
      this.fail(err);
    }
  }

  async addSection(afterSectionId?: string | null) {
    const name = this.newSectionName.trim() || 'Untitled section';
    this.newSectionName = '';
    this.addingSection.set(false);
    try {
      const section = await this.api.createSection(this.projectId(), name, afterSectionId);
      const p = this.project();
      if (p) this.project.set({ ...p, sections: [...p.sections, section] });
    } catch (err) {
      this.fail(err);
    }
  }

  async addSectionBelow() {
    const section = this.menuSection;
    this.sectionMenu().hide();
    if (!section) return;
    try {
      const created = await this.api.createSection(this.projectId(), 'Untitled section', section.id);
      const p = this.project();
      if (p) this.project.set({ ...p, sections: [...p.sections, created] });
      this.startRenameSection(created);
    } catch (err) {
      this.fail(err);
    }
  }

  deleteSection() {
    const section = this.menuSection;
    this.sectionMenu().hide();
    if (!section) return;
    const count = this.tasks().filter((t) => t.sectionId === section.id).length;
    this.confirm.confirm({
      header: `Delete “${section.name}”?`,
      message: count
        ? `Its ${count} task(s) will move to the section above.`
        : 'This section is empty.',
      acceptLabel: 'Delete section',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.deleteSection(section.id);
          await this.load(this.projectId(), true);
        } catch (err) {
          this.fail(err);
        }
      },
    });
  }

  // ── Project header ──────────────────────────────────────────────────────

  async toggleStar() {
    const p = this.project();
    if (!p) return;
    this.project.set({ ...p, isStarred: !p.isStarred });
    await this.store.toggleStar({ id: p.id, isStarred: p.isStarred });
  }

  openColor(event: Event) {
    if (this.canEdit()) this.colorMenu().toggle(event);
  }

  async setIcon(icon: string | null) {
    const p = this.project();
    this.colorMenu().hide();
    if (!p) return;
    this.project.set({ ...p, icon });
    this.store.patchProject(p.id, { icon });
    try {
      await this.api.updateProject(p.id, { icon });
    } catch (err) {
      this.fail(err);
    }
  }

  async setColor(color: string) {
    const p = this.project();
    if (!p) return;
    this.project.set({ ...p, color });
    this.store.patchProject(p.id, { color });
    try {
      await this.api.updateProject(p.id, { color });
    } catch (err) {
      this.fail(err);
    }
  }

  openProjectMenu(event: Event) {
    this.projectMenu().toggle(event);
  }

  /** Hide this project from Tasks (its tasks are kept if it's added back later). */
  removeFromTasks() {
    const p = this.project();
    this.projectMenu().hide();
    if (!p) return;
    this.confirm.confirm({
      header: `Remove “${p.name}” from Tasks?`,
      message: 'The project itself is not changed. Its tasks are kept and come back if you add it to Tasks again.',
      acceptLabel: 'Remove from Tasks',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.removeProject(p.id);
          await this.store.loadProjects();
          await this.router.navigate(['/tasks/projects']);
        } catch (err) {
          this.fail(err);
        }
      },
    });
  }

  onProjectUpdated(project: TmProject) {
    this.project.set(project);
    this.store.invalidatePeople(project.id);
    this.store.people(project.id).then((p) => this.people.set(p)).catch(() => undefined);
  }

  onFieldsChanged() {
    void this.load(this.projectId(), true);
  }

  trackTask(_: number, t: TaskSummary) {
    return t.id;
  }
}
