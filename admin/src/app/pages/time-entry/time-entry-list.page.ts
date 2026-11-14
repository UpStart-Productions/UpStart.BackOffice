import {
  AfterViewInit,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
  viewChild,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { LIST_VIEW_KEYS, listViewFilterString, readListViewPrefs } from '../../core/list-view-prefs.storage';
import { saveListFilter } from '../../core/list-view-prefs.util';
import { parseDateKey } from '../../core/date.util';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TagModule } from 'primeng/tag';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';
import { PageComponent } from '../../ui/layout/page.component';
import { InlineCalendarPopoverComponent } from '../../ui/inline-calendar-popover/inline-calendar-popover.component';
import { PeopleDirectoryOption, teamUsersToOptions } from '../projects/people-directory.util';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { RowActionsMenuComponent, RowActionItem } from '../../ui/row-actions-menu/row-actions-menu.component';
import { TimeEntryModalComponent } from './time-entry-modal.component';
import type { ClientOption, Project, TimeEntry, TimeEntryTask } from './time-entry.types';
import {
  addDays,
  dateKey,
  dayLabel,
  endOfWeek,
  formatDayHeading,
  formatDurationMin,
  formatElapsed,
  isSameDay,
  isToday,
  startOfWeek,
  weekDays,
} from './timesheet.utils';

@Component({
  selector: 'app-time-entry-list-page',
  standalone: true,
  imports: [
    ButtonModule,
    DatePickerModule,
    FormsModule,
    PageComponent,
    InlineCalendarPopoverComponent,
    PeopleSelectComponent,
    TimeEntryModalComponent,
    RowActionsMenuComponent,
    ToggleSwitchModule,
    TagModule,
    AppPopoverModule,
  ],
  templateUrl: './time-entry-list.page.html',
  styleUrl: './time-entry-list.page.scss',
})
export class TimeEntryListPage implements OnInit, OnDestroy, AfterViewInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly session = inject(SessionService);
  private readonly modal = viewChild.required(TimeEntryModalComponent);
  private readonly weekDaysTrack = viewChild<ElementRef<HTMLElement>>('weekDaysTrack');

  @ViewChild('csvFileInput') csvFileInput?: ElementRef<HTMLInputElement>;

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private weekDaysResize: ResizeObserver | null = null;
  readonly dayIndicator = signal({ left: 0, width: 0, ready: false });
  private readonly tick = signal(0);

  entries = signal<TimeEntry[]>([]);
  projects = signal<Project[]>([]);
  clients = signal<ClientOption[]>([]);
  /** People whose timesheet this user can view (only themselves unless their role has Time at All). */
  people = signal<PeopleDirectoryOption[]>([]);
  /** Whose timesheet is shown; defaults to the signed-in user. */
  viewUserId = signal<string>('');
  readonly viewingSelf = computed(() => !this.viewUserId() || this.viewUserId() === this.session.me()?.id);
  readonly trackTimeMenuActions = computed<RowActionItem[]>(() => [
    {
      id: 'import-csv',
      label: 'Import CSV',
      icon: 'pi pi-upload',
      disabled: this.importing(),
      command: () => this.triggerCsvPicker(),
    },
  ]);
  /** Tenant admins and super users can flip billable on any visible entry. */
  readonly canToggleEntryBillable = computed(() => {
    const me = this.session.me();
    return !!(me?.isSuper || me?.role === 'ADMIN');
  });
  private billableSavingIds = signal<ReadonlySet<string>>(new Set());
  asanaConnected = signal(false);
  loading = signal(true);
  importing = signal(false);
  error = signal<string | null>(null);
  saving = signal(false);

  selectedDay = signal(new Date());
  private loadedWeekKey = signal(dateKey(startOfWeek(new Date())));
  private readonly daysWithTime = signal<ReadonlySet<string>>(new Set());
  /** Projects per calendar day (YYYY-MM-DD) for jump-calendar hovers; names respect project access. */
  private readonly dayProjectsByKey = signal<ReadonlyMap<string, { id: string; name: string }[]>>(new Map());
  private calendarMonthHintsKey = '';
  private calendarMonthLoads = new Map<string, Promise<void>>();
  /** Day key (YYYY-MM-DD) currently hovered on the jump calendar, if any. */
  private calendarHoverDayKey = '';
  readonly hoverDayProjects = signal<{ id: string; name: string }[]>([]);
  private readonly dayProjectsPopover = viewChild<Popover>('dayProjectsPopover');
  private dayProjectsShowTimer: ReturnType<typeof setTimeout> | null = null;
  private dayProjectsHideTimer: ReturnType<typeof setTimeout> | null = null;

  readonly weekStart = computed(() => startOfWeek(this.selectedDay()));
  readonly days = computed(() => weekDays(this.weekStart()));
  readonly isSelectedToday = computed(() => isToday(this.selectedDay()));
  readonly dayHeading = computed(() => formatDayHeading(this.selectedDay()));

  readonly runningEntry = computed(() => {
    this.tick();
    return this.entries().find((e) => !e.stoppedAt) ?? null;
  });

  readonly runningElapsedMin = computed(() => {
    const running = this.runningEntry();
    if (!running) return 0;
    const ms = Date.now() - new Date(running.startedAt).getTime();
    return Math.round(ms / 60_000);
  });

  readonly dayEntries = computed(() => {
    const key = dateKey(this.selectedDay());
    const running = this.runningEntry();
    return this.entries()
      .filter((e) => {
        if (dateKey(new Date(e.startedAt)) !== key) return false;
        if (!e.stoppedAt && running && e.id !== running.id) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
      );
  });

  readonly dayTotalMin = computed(() => this.sumSelectedDayMinutes());

  readonly dayNonBillableMin = computed(() => this.sumSelectedDayMinutes('non-billable'));

  readonly weekTotalMin = computed(() => {
    const running = this.runningEntry();
    const weekKeys = new Set(this.days().map((d) => dateKey(d)));
    let total = 0;
    for (const e of this.entries()) {
      const key = dateKey(new Date(e.startedAt));
      if (!weekKeys.has(key)) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) {
          total += this.runningElapsedMin();
        }
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  });

  constructor() {
    effect(() => {
      this.selectedDay();
      this.weekStart();
      this.loading();
      untracked(() => queueMicrotask(() => this.layoutWeekDayIndicator()));
    });
  }

  ngOnInit() {
    this.timerInterval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    void this.init();
  }

  ngAfterViewInit() {
    const el = this.weekDaysTrack()?.nativeElement;
    if (el && typeof ResizeObserver !== 'undefined') {
      this.weekDaysResize = new ResizeObserver(() => this.layoutWeekDayIndicator());
      this.weekDaysResize.observe(el);
    }
    this.layoutWeekDayIndicator();
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.weekDaysResize?.disconnect();
    this.cancelDayProjectsShow();
    this.cancelDayProjectsHide();
  }

  @HostListener('window:resize')
  onWindowResize() {
    this.layoutWeekDayIndicator();
  }

  /** Slides the week underline like PrimeNG tab ink bar. */
  private layoutWeekDayIndicator() {
    const track = this.weekDaysTrack()?.nativeElement;
    if (!track) return;
    const selected = track.querySelector<HTMLElement>('.week-day.selected');
    if (!selected) {
      this.dayIndicator.set({ left: 0, width: 0, ready: false });
      return;
    }
    const trackRect = track.getBoundingClientRect();
    const btnRect = selected.getBoundingClientRect();
    this.dayIndicator.set({
      left: btnRect.left - trackRect.left,
      width: btnRect.width,
      ready: true,
    });
  }

  private async init() {
    const me = this.session.me()?.id ?? '';
    const prefs = readListViewPrefs(me, LIST_VIEW_KEYS.timeEntries);
    const savedUser = listViewFilterString(prefs, 'viewUserId');
    this.viewUserId.set(savedUser || me);
    const savedDay = listViewFilterString(prefs, 'selectedDay');
    const parsedDay = savedDay ? parseDateKey(savedDay) : null;
    if (parsedDay) this.selectedDay.set(parsedDay);
    await Promise.all([this.loadProjects(), this.loadClients(), this.loadPeople(), this.loadAsanaStatus(), this.loadDaysWithTime()]);
    await this.loadWeek();
  }

  private persistTimeListPrefs() {
    saveListFilter(this.session, LIST_VIEW_KEYS.timeEntries, 'viewUserId', this.viewUserId() || null);
    saveListFilter(this.session, LIST_VIEW_KEYS.timeEntries, 'selectedDay', dateKey(this.selectedDay()));
  }

  async loadDaysWithTime() {
    try {
      const startedAt = await this.api.get<string[]>(`/time-entries/days${this.userQuery('?')}`);
      this.daysWithTime.set(new Set(startedAt.map((iso) => dateKey(new Date(iso)))));
    } catch {
      this.daysWithTime.set(
        new Set(this.entries().map((e) => dateKey(new Date(e.startedAt)))),
      );
    }
  }

  async loadAsanaStatus() {
    try {
      const status = await this.api.get<{ connected: boolean }>('/asana/status');
      this.asanaConnected.set(status.connected);
    } catch {
      this.asanaConnected.set(false);
    }
  }

  /** `?userId=…` (or `&userId=…`) for the person being viewed. */
  private userQuery(sep: '?' | '&'): string {
    const id = this.viewUserId();
    return id ? `${sep}userId=${encodeURIComponent(id)}` : '';
  }

  async loadClients() {
    try {
      this.clients.set(await this.api.get<ClientOption[]>('/clients/lookup'));
    } catch {
      this.clients.set([]);
    }
  }

  async loadPeople() {
    try {
      const rows = await this.api.get<
        { id: string; firstName?: string | null; lastName?: string | null; email: string; avatarUrl?: string | null }[]
      >('/time-entries/people');
      this.people.set(teamUsersToOptions(rows));
    } catch {
      this.people.set([]);
    }
  }

  async onViewUserChange(id: string | null) {
    this.viewUserId.set(id || (this.session.me()?.id ?? ''));
    this.persistTimeListPrefs();
    this.resetCalendarProjectHints();
    await Promise.all([this.loadWeek(), this.loadDaysWithTime()]);
  }

  async loadProjects() {
    try {
      const data = await this.api.get<Project[]>('/projects');
      this.projects.set(data);
    } catch {
      /* ignore */
    }
  }

  async loadWeek() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const from = this.weekStart().toISOString();
      const to = endOfWeek(this.weekStart()).toISOString();
      let data = await this.api.get<TimeEntry[]>(
        `/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${this.userQuery('&')}`,
      );
      if (!data.some((e) => !e.stoppedAt)) {
        const all = await this.api.get<TimeEntry[]>(`/time-entries${this.userQuery('?')}`);
        const active = all.find((e) => !e.stoppedAt);
        if (active && !data.some((e) => e.id === active.id)) {
          data = [active, ...data];
        }
      }
      this.entries.set(data);
      this.mergeEntriesIntoDayProjects(data);
      this.loadedWeekKey.set(dateKey(startOfWeek(this.selectedDay())));
      void this.loadDaysWithTime();
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : 'Failed to load timesheet',
      );
    } finally {
      this.loading.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (this.modal().visible) return;
    if (this.isTextEntryTarget(event.target)) return;
    if (this.isBlockingOverlayOpen()) return;

    event.preventDefault();
    if (event.key === 'ArrowLeft') this.prevDay();
    else this.nextDay();
  }

  private isTextEntryTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    return target.isContentEditable;
  }

  private isBlockingOverlayOpen(): boolean {
    return !!document.querySelector('.p-dialog-mask, .p-datepicker-panel');
  }

  prevDay() {
    this.selectedDay.set(addDays(this.selectedDay(), -1));
    this.persistTimeListPrefs();
    void this.loadWeekIfNeeded();
  }

  nextDay() {
    this.selectedDay.set(addDays(this.selectedDay(), 1));
    this.persistTimeListPrefs();
    void this.loadWeekIfNeeded();
  }

  goToToday() {
    this.selectedDay.set(new Date());
    this.persistTimeListPrefs();
    void this.loadWeek();
  }

  selectDay(d: Date) {
    this.selectedDay.set(new Date(d));
    this.persistTimeListPrefs();
    void this.loadWeekIfNeeded();
  }

  jumpToDay(date: Date, popover: InlineCalendarPopoverComponent) {
    this.selectedDay.set(new Date(date));
    this.persistTimeListPrefs();
    popover.hide();
    void this.loadWeekIfNeeded();
  }

  private async loadWeekIfNeeded() {
    const key = dateKey(startOfWeek(this.selectedDay()));
    if (key !== this.loadedWeekKey()) {
      await this.loadWeek();
    }
  }

  isDaySelected(d: Date): boolean {
    return isSameDay(d, this.selectedDay());
  }

  isDayToday(d: Date): boolean {
    return isToday(d);
  }

  isDayRunning(d: Date): boolean {
    const running = this.runningEntry();
    if (!running) return false;
    return dateKey(d) === dateKey(new Date(running.startedAt));
  }

  dayKey(d: Date): string {
    return dateKey(d);
  }

  hasTimeOnDate(date: { day: number; month: number; year: number }): boolean {
    return this.daysWithTime().has(dateKey(new Date(date.year, date.month, date.day)));
  }

  openJumpCalendar(event: Event, popover: InlineCalendarPopoverComponent) {
    popover.toggle(event, event.currentTarget as HTMLElement);
    this.mergeEntriesIntoDayProjects(this.entries());
    void this.loadCalendarMonthProjects(this.selectedDay());
  }

  onCalendarMonthChange(event: { month: number; year: number }) {
    void this.loadCalendarMonthProjects(new Date(event.year, event.month, 1));
  }

  onCalDayPointerEnter(event: MouseEvent, date: { day: number; month: number; year: number }) {
    if (!this.hasTimeOnDate(date)) return;
    this.cancelDayProjectsHide();
    this.cancelDayProjectsShow();
    const day = new Date(date.year, date.month, date.day);
    const key = dateKey(day);
    const target = event.currentTarget;
    if (!(target instanceof HTMLElement)) return;

    this.calendarHoverDayKey = key;
    this.dayProjectsShowTimer = setTimeout(() => {
      this.dayProjectsShowTimer = null;
      void this.openDayProjectsPopover(event, target, key, day);
    }, 500);
  }

  onCalDayPointerLeave() {
    this.calendarHoverDayKey = '';
    this.cancelDayProjectsShow();
    this.scheduleDayProjectsHide();
  }

  scheduleDayProjectsHide() {
    this.cancelDayProjectsHide();
    this.dayProjectsHideTimer = setTimeout(() => this.dayProjectsPopover()?.hide(), 120);
  }

  cancelDayProjectsHide() {
    if (this.dayProjectsHideTimer) {
      clearTimeout(this.dayProjectsHideTimer);
      this.dayProjectsHideTimer = null;
    }
  }

  cancelDayProjectsShow() {
    if (this.dayProjectsShowTimer) {
      clearTimeout(this.dayProjectsShowTimer);
      this.dayProjectsShowTimer = null;
    }
  }

  private resetCalendarProjectHints() {
    this.calendarMonthHintsKey = '';
    this.calendarMonthLoads.clear();
    this.calendarHoverDayKey = '';
    this.dayProjectsByKey.set(new Map());
    this.hoverDayProjects.set([]);
    this.dayProjectsPopover()?.hide();
  }

  private async openDayProjectsPopover(
    event: MouseEvent,
    target: HTMLElement,
    key: string,
    day: Date,
  ) {
    if (this.calendarHoverDayKey !== key) return;
    await this.loadCalendarMonthProjects(day);
    this.mergeEntriesIntoDayProjects(
      this.entries().filter((e) => dateKey(new Date(e.startedAt)) === key),
    );
    if (this.calendarHoverDayKey !== key) return;

    const projects = this.dayProjectsByKey().get(key) ?? [];
    if (projects.length === 0) return;
    this.hoverDayProjects.set(projects);
    this.dayProjectsPopover()?.show(event, target);
  }

  private mergeEntriesIntoDayProjects(rows: TimeEntry[]) {
    if (!rows.length) return;

    const visibleProjectIds = new Set(this.projects().map((p) => p.id));
    const next = new Map(this.dayProjectsByKey());

    for (const e of rows) {
      const day = dateKey(new Date(e.startedAt));
      const bucket = new Map(
        (next.get(day) ?? []).map((p) => [p.id || `none:${p.name}`, p] as const),
      );

      const projectId = e.project?.id;
      if (projectId) {
        if (!visibleProjectIds.has(projectId)) continue;
        bucket.set(projectId, { id: projectId, name: e.project!.name });
      } else {
        const label = e.client?.name ?? 'No project';
        bucket.set(`none:${label}`, { id: '', name: label });
      }

      next.set(day, [...bucket.values()].sort((a, b) => a.name.localeCompare(b.name)));
    }

    this.dayProjectsByKey.set(next);
  }

  private async loadCalendarMonthProjects(anchor: Date): Promise<void> {
    const cacheKey = `${anchor.getFullYear()}-${anchor.getMonth()}`;
    const inFlight = this.calendarMonthLoads.get(cacheKey);
    if (inFlight) return inFlight;
    if (this.calendarMonthHintsKey === cacheKey) return;

    const load = this.fetchCalendarMonthProjects(anchor, cacheKey);
    this.calendarMonthLoads.set(cacheKey, load);
    try {
      await load;
    } finally {
      this.calendarMonthLoads.delete(cacheKey);
    }
  }

  private async fetchCalendarMonthProjects(anchor: Date, cacheKey: string) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59, 999);

    try {
      const rows = await this.api.get<TimeEntry[]>(
        `/time-entries?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${this.userQuery('&')}`,
      );
      const visibleProjectIds = new Set(this.projects().map((p) => p.id));
      const byDay = new Map<string, Map<string, { id: string; name: string }>>();

      for (const e of rows) {
        const day = dateKey(new Date(e.startedAt));
        const bucket = byDay.get(day) ?? new Map<string, { id: string; name: string }>();
        byDay.set(day, bucket);

        const projectId = e.project?.id;
        if (projectId) {
          if (!visibleProjectIds.has(projectId)) continue;
          bucket.set(projectId, { id: projectId, name: e.project!.name });
        } else {
          const label = e.client?.name ?? 'No project';
          bucket.set(`none:${label}`, { id: '', name: label });
        }
      }

      const next = new Map(this.dayProjectsByKey());
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        next.delete(dateKey(new Date(year, month, d)));
      }
      for (const [day, projects] of byDay) {
        next.set(
          day,
          [...projects.values()].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      this.dayProjectsByKey.set(next);
      this.calendarMonthHintsKey = cacheKey;
    } catch {
      /* hover list is optional */
    }
  }

  dayShortLabel(d: Date): string {
    const label = dayLabel(d);
    return `${label.short} ${label.md}`;
  }

  dayTotalFor(d: Date): number {
    const key = dateKey(d);
    const running = this.runningEntry();
    let total = 0;
    for (const e of this.entries()) {
      if (dateKey(new Date(e.startedAt)) !== key) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) total += this.runningElapsedMin();
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  }

  entryDurationLabel(entry: TimeEntry): string {
    if (!entry.stoppedAt) {
      const ms = Date.now() - new Date(entry.startedAt).getTime();
      const min = Math.max(0, Math.round(ms / 60_000));
      return formatDurationMin(min);
    }
    return formatDurationMin(entry.durationMin ?? 0);
  }

  projectTitle(entry: TimeEntry): string {
    if (entry.project) return `${entry.project.name} (${entry.project.client?.name ?? 'Personal'})`;
    return entry.client?.name ?? 'No project';
  }

  async openTrackTimeModal() {
    const result = await this.modal().open({
      day: this.selectedDay(),
      projects: this.projects(),
      clients: this.clients(),
      asanaConnected: this.asanaConnected(),
    });
    if (result !== 'cancelled') await this.loadWeek();
  }

  triggerCsvPicker() {
    this.csvFileInput?.nativeElement.click();
  }

  async onCsvSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.importing.set(true);
    this.error.set(null);
    try {
      const fileBase64 = await this.fileToBase64(file);
      const result = await this.api.post<{ imported: number; total: number }>(
        '/time-entries/import',
        { fileBase64 },
      );
      this.toast.add({
        severity: 'success',
        summary: 'Import complete',
        detail: `Imported ${result.imported} time entr${result.imported === 1 ? 'y' : 'ies'}.`,
        life: 6000,
      });
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1]! : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async openEditModal(entry: TimeEntry) {
    const result = await this.modal().open({
      day: this.selectedDay(),
      projects: this.projects(),
      clients: this.clients(),
      asanaConnected: this.asanaConnected(),
      entry,
    });
    if (result !== 'cancelled') await this.loadWeek();
  }

  async startFromEntry(entry: TimeEntry) {
    if (this.runningEntry()) {
      this.error.set('Stop the current timer first.');
      return;
    }
    if (!entry.stoppedAt) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.post<TimeEntry>(
        `/time-entries/${entry.id}/restart`,
        {},
      );
      this.entries.update((list) =>
        list.map((e) => (e.id === updated.id ? updated : e)),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start timer');
      await this.loadWeek();
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
      await this.api.post(`/time-entries/${running.id}/stop`);
      await this.loadWeek();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to stop timer');
    } finally {
      this.saving.set(false);
    }
  }

  formatMin(min: number): string {
    return formatDurationMin(min);
  }

  dayTotalAriaLabel(): string {
    const total = this.formatMin(this.dayTotalMin());
    const nonBillable = this.dayNonBillableMin();
    if (nonBillable <= 0) {
      return `Day total ${total} hours`;
    }
    return `Day total ${total} hours, non-billable ${this.formatMin(nonBillable)}`;
  }

  private sumSelectedDayMinutes(kind?: 'billable' | 'non-billable'): number {
    const running = this.runningEntry();
    const key = dateKey(this.selectedDay());
    let total = 0;
    for (const e of this.entries()) {
      if (dateKey(new Date(e.startedAt)) !== key) continue;
      let min = 0;
      if (!e.stoppedAt) {
        if (e.id === running?.id) min = this.runningElapsedMin();
      } else {
        min = e.durationMin ?? 0;
      }
      if (min <= 0) continue;
      const billable = this.isEntryBillableForSummary(e);
      if (kind === 'billable' && !billable) continue;
      if (kind === 'non-billable' && billable) continue;
      total += min;
    }
    return total;
  }

  private isEntryBillableForSummary(entry: TimeEntry): boolean {
    if (entry.project?.isBillable === false) return false;
    return !!entry.isBillable;
  }

  workTasks(entry: TimeEntry): TimeEntryTask[] {
    if (entry.tasks?.length) return entry.tasks;
    return entry.task ? [entry.task] : [];
  }

  workTaskLine(task: TimeEntryTask): string {
    return task.parent?.name ? `${task.parent.name} › ${task.name}` : task.name;
  }

  billableToggleDisabled(entry: TimeEntry): boolean {
    return (
      this.saving() ||
      this.billableSavingIds().has(entry.id) ||
      entry.project?.isBillable === false
    );
  }

  billableToggleTitle(entry: TimeEntry): string {
    if (entry.project?.isBillable === false) {
      return 'This project is non-billable';
    }
    return entry.isBillable ? 'Billable — click to mark non-billable' : 'Non-billable — click to mark billable';
  }

  async setEntryBillable(entry: TimeEntry, isBillable: boolean) {
    if (!this.canToggleEntryBillable() || entry.isBillable === isBillable) return;

    this.billableSavingIds.update((ids) => new Set(ids).add(entry.id));
    try {
      const updated = await this.api.put<TimeEntry>(`/time-entries/${entry.id}`, { isBillable });
      this.entries.update((list) => list.map((e) => (e.id === updated.id ? updated : e)));
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Billable',
        detail: err instanceof Error ? err.message : 'Could not update billable',
        life: 6000,
      });
    } finally {
      this.billableSavingIds.update((ids) => {
        const next = new Set(ids);
        next.delete(entry.id);
        return next;
      });
    }
  }
}
