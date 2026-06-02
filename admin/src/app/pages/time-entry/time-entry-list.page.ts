import {
  Component,
  computed,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import {
  addDays,
  dateKey,
  dayLabel as formatDayLabel,
  endOfWeek,
  formatCellHours as formatCellHoursUtil,
  formatElapsed,
  formatWeekRange,
  hoursToMinutes,
  isToday,
  minutesToHours,
  parseHoursInput,
  startOfWeek,
  weekDays,
} from './timesheet.utils';

export type Project = {
  id: string;
  name: string;
  client: { id: string; name: string };
};

export type TimeEntry = {
  id: string;
  description?: string;
  startedAt: string;
  stoppedAt?: string;
  durationMin?: number;
  isBillable: boolean;
  project: Project;
};

type CellEdit = { projectId: string; dayKey: string };

@Component({
  selector: 'app-time-entry-list-page',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './time-entry-list.page.html',
  styleUrl: './time-entry-list.page.scss',
})
export class TimeEntryListPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private readonly tick = signal(0);

  entries = signal<TimeEntry[]>([]);
  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);

  weekAnchor = signal(startOfWeek(new Date()));
  extraProjectIds = signal<string[]>([]);

  timerProjectId = signal('');
  timerNotes = signal('');
  projectPickerOpen = signal(false);
  projectSearch = signal('');
  addRowPickerOpen = signal(false);
  addRowSearch = signal('');

  editingCell = signal<CellEdit | null>(null);
  editDraft = signal('');

  readonly days = computed(() => weekDays(this.weekAnchor()));
  readonly weekLabel = computed(() => formatWeekRange(this.weekAnchor()));
  readonly isCurrentWeek = computed(() =>
    dateKey(this.weekAnchor()) === dateKey(startOfWeek(new Date())),
  );

  readonly runningEntry = computed(() => {
    this.tick();
    return this.entries().find((e) => !e.stoppedAt) ?? null;
  });

  readonly elapsedLabel = computed(() => {
    const running = this.runningEntry();
    if (!running) return '0:00:00';
    const ms = Date.now() - new Date(running.startedAt).getTime();
    return formatElapsed(ms);
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

  readonly addRowProjects = computed(() => {
    const q = this.addRowSearch().trim().toLowerCase();
    const used = new Set(this.gridProjectIds());
    const list = this.projects().filter((p) => !used.has(p.id));
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.name.toLowerCase().includes(q),
    );
  });

  readonly gridProjectIds = computed(() => {
    const ids = new Set<string>();
    for (const e of this.entries()) {
      if (e.stoppedAt) ids.add(e.project.id);
    }
    for (const id of this.extraProjectIds()) ids.add(id);
    return [...ids];
  });

  readonly gridProjects = computed(() => {
    const byId = new Map(this.projects().map((p) => [p.id, p]));
    return this.gridProjectIds()
      .map((id) => byId.get(id))
      .filter((p): p is Project => !!p);
  });

  get wsSlug() {
    return this.auth.workspaceSlug;
  }

  ngOnInit() {
    this.timerInterval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    void this.init();
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  private async init() {
    await this.loadProjects();
    await this.loadWeek();
  }

  async loadProjects() {
    try {
      const data = await this.api.get<Project[]>(
        `/workspaces/${this.wsSlug}/projects`,
      );
      this.projects.set(data);
    } catch {
      /* ignore */
    }
  }

  async loadWeek() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.weekAnchor().toISOString();
      const to = endOfWeek(this.weekAnchor()).toISOString();
      let data = await this.api.get<TimeEntry[]>(
        `/workspaces/${this.wsSlug}/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!data.some((e) => !e.stoppedAt)) {
        const all = await this.api.get<TimeEntry[]>(
          `/workspaces/${this.wsSlug}/time-entries`,
        );
        const active = all.find((e) => !e.stoppedAt);
        if (active && !data.some((e) => e.id === active.id)) {
          data = [active, ...data];
        }
      }
      this.entries.set(data);
      const running = data.find((e) => !e.stoppedAt);
      if (running) {
        this.timerProjectId.set(running.project.id);
        this.timerNotes.set(running.description ?? '');
      }
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load timesheet',
      );
    } finally {
      this.loading.set(false);
    }
  }

  prevWeek() {
    this.weekAnchor.set(addDays(this.weekAnchor(), -7));
    void this.loadWeek();
  }

  nextWeek() {
    this.weekAnchor.set(addDays(this.weekAnchor(), 7));
    void this.loadWeek();
  }

  goToThisWeek() {
    this.weekAnchor.set(startOfWeek(new Date()));
    void this.loadWeek();
  }

  isDayToday(d: Date): boolean {
    return isToday(d);
  }

  dayKey(d: Date): string {
    return dateKey(d);
  }

  dayLabel(d: Date) {
    return formatDayLabel(d);
  }

  projectLabel(p: Project): string {
    return `${p.client.name} / ${p.name}`;
  }

  timerProjectLabel(): string {
    const id = this.timerProjectId();
    const p = this.projects().find((x) => x.id === id);
    return p ? this.projectLabel(p) : '';
  }

  toggleProjectPicker() {
    this.projectPickerOpen.update((v) => !v);
    if (this.projectPickerOpen()) this.projectSearch.set('');
  }

  selectTimerProject(p: Project) {
    this.timerProjectId.set(p.id);
    this.projectPickerOpen.set(false);
    this.projectSearch.set('');
  }

  toggleAddRowPicker() {
    this.addRowPickerOpen.update((v) => !v);
    if (this.addRowPickerOpen()) this.addRowSearch.set('');
  }

  addProjectRow(p: Project) {
    if (!this.extraProjectIds().includes(p.id)) {
      this.extraProjectIds.update((ids) => [...ids, p.id]);
    }
    this.addRowPickerOpen.set(false);
    this.addRowSearch.set('');
  }

  cellHours(projectId: string, d: Date): number {
    const key = dateKey(d);
    let min = 0;
    for (const e of this.entries()) {
      if (e.project.id !== projectId || e.stoppedAt == null) continue;
      if (dateKey(new Date(e.startedAt)) === key) {
        min += e.durationMin ?? 0;
      }
    }
    return minutesToHours(min);
  }

  rowTotalHours(projectId: string): number {
    return this.days().reduce(
      (sum, d) => sum + this.cellHours(projectId, d),
      0,
    );
  }

  dayTotalHours(d: Date): number {
    return this.gridProjectIds().reduce(
      (sum, pid) => sum + this.cellHours(pid, d),
      0,
    );
  }

  weekTotalHours(): number {
    return this.days().reduce((sum, d) => sum + this.dayTotalHours(d), 0);
  }

  isEditing(projectId: string, d: Date): boolean {
    const c = this.editingCell();
    return !!c && c.projectId === projectId && c.dayKey === dateKey(d);
  }

  startEdit(projectId: string, d: Date) {
    if (this.saving()) return;
    this.editingCell.set({ projectId, dayKey: dateKey(d) });
    this.editDraft.set(formatCellHoursUtil(this.cellHours(projectId, d)));
  }

  cancelEdit() {
    this.editingCell.set(null);
    this.editDraft.set('');
  }

  async commitEdit(projectId: string, d: Date) {
    const parsed = parseHoursInput(this.editDraft());
    if (parsed === null) {
      this.error.set('Invalid time. Use hours (2.5) or H:MM (2:30).');
      return;
    }
    this.editingCell.set(null);
    this.editDraft.set('');
    await this.setCellHours(projectId, d, parsed);
  }

  onCellKeydown(event: KeyboardEvent, projectId: string, d: Date) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.commitEdit(projectId, d);
    }
    if (event.key === 'Escape') this.cancelEdit();
  }

  private async setCellHours(projectId: string, d: Date, hours: number) {
    this.saving.set(true);
    this.error.set(null);
    try {
      const key = dateKey(d);
      const existing = this.entries().filter(
        (e) =>
          e.project.id === projectId &&
          e.stoppedAt != null &&
          dateKey(new Date(e.startedAt)) === key,
      );

      for (const e of existing) {
        await this.api.delete(
          `/workspaces/${this.wsSlug}/time-entries/${e.id}`,
        );
      }

      if (hours > 0) {
        const startedAt = new Date(d);
        startedAt.setHours(9, 0, 0, 0);
        const stoppedAt = new Date(
          startedAt.getTime() + hoursToMinutes(hours) * 60_000,
        );
        await this.api.post(`/workspaces/${this.wsSlug}/time-entries`, {
          projectId,
          startedAt: startedAt.toISOString(),
          stoppedAt: stoppedAt.toISOString(),
          isBillable: true,
        });
      }

      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }

  async startTimer() {
    const projectId = this.timerProjectId();
    if (!projectId) {
      this.error.set('Choose a project to start the timer.');
      return;
    }
    if (this.runningEntry()) {
      this.error.set('Stop the current timer first.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.post(`/workspaces/${this.wsSlug}/time-entries`, {
        projectId,
        description: this.timerNotes().trim() || undefined,
        startedAt: new Date().toISOString(),
        isBillable: true,
      });
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start timer');
    } finally {
      this.saving.set(false);
    }
  }

  async stopTimer() {
    const running = this.runningEntry();
    if (!running) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.post(
        `/workspaces/${this.wsSlug}/time-entries/${running.id}/stop`,
      );
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to stop timer');
    } finally {
      this.saving.set(false);
    }
  }

  formatTotal(h: number): string {
    return h > 0 ? formatCellHoursUtil(h) : '–';
  }

  formatCellHours(hours: number): string {
    return formatCellHoursUtil(hours);
  }

  @HostListener('document:click')
  closeDropdowns() {
    this.projectPickerOpen.set(false);
    this.addRowPickerOpen.set(false);
  }
}
