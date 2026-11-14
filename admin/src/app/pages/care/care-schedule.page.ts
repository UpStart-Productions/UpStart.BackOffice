import { NgTemplateOutlet } from '@angular/common';
import { DateNavComponent } from '../../ui/date-nav/date-nav.component';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';
import { TooltipModule } from 'primeng/tooltip';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { LIST_VIEW_KEYS, listViewFilterString, patchListViewPrefs, readListViewPrefs } from '../../core/list-view-prefs.storage';
import { TimeInputComponent } from '../../ui/time-input/time-input.component';
import { PersonComponent } from '../../ui/person/person.component';
import { DatePipe } from '@angular/common';
import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { WEEKDAY_SHORT, type CareShiftDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { dateKey } from '../../core/date.util';
import { SessionService } from '../../core/session.service';
import { browserTimeZone, timeKey } from '../../ui/care-forms/care.types';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { PeopleDirectoryOption, teamUsersToOptions } from '../projects/people-directory.util';

/** Monday 00:00 (local) of the week containing d. */
function weekStartOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Care → Schedule: a week of shifts per account and worker, one-off or repeating weekly. */
@Component({
  selector: 'app-care-schedule-page',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    DateNavComponent,
    TooltipModule,
    LucideIconComponent,
    TimeInputComponent,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    TagModule,
    TextareaModule,
    AppDialogModule,
    DateInputComponent,
    HelpTextComponent,
    OrganizationSelectComponent,
    PageComponent,
    PeopleSelectComponent,
    RowActionsMenuComponent,
    PersonComponent,
  ],
  templateUrl: './care-schedule.page.html',
  styleUrl: './care-schedule.page.scss',
})
export class CareSchedulePage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  readonly todayKey = dateKey(new Date());
  readonly weekdayOptions = [1, 2, 3, 4, 5, 6, 0].map((value) => ({ value, label: WEEKDAY_SHORT[value] }));

  private readonly savedPrefs = readListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.careSchedule);
  /** A saved "YYYY-MM-DD" filter as a local date (or null). */
  private savedDate(key: string): Date | null {
    const v = listViewFilterString(this.savedPrefs, key);
    const m = v ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null;
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  /** Restored from the last visit (the week and month you were looking at), else this week / month. */
  weekStart = signal(weekStartOf(this.savedDate('week') ?? new Date()));
  shifts = signal<CareShiftDto[]>([]);
  workers = signal<PeopleDirectoryOption[]>([]);
  /** Saved Worker and Client filters (this browser, this user), like the other list screens. */
  workerId = signal<string | null>(listViewFilterString(this.savedPrefs, 'worker'));
  /** ?clientId= presets the filter (from a client's Care tab). */
  clientId = signal<string | null>(this.route.snapshot.queryParamMap.get('clientId') ?? listViewFilterString(this.savedPrefs, 'client'));
  /** Week (one client or worker, by hour) or Month (everyone, a bar per shift). */
  view = signal<'week' | 'month'>(listViewFilterString(this.savedPrefs, 'view') === 'month' ? 'month' : 'week');
  readonly tooltipDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;
  /** First day of the visible month. */
  monthStart = signal(
    ((d: Date) => new Date(d.getFullYear(), d.getMonth(), 1))(this.savedDate('month') ?? new Date()),
  );
  private readonly saveFilters = effect(() => {
    const filters: Record<string, string> = {};
    const worker = this.workerId();
    const client = this.clientId();
    if (worker) filters['worker'] = worker;
    if (client) filters['client'] = client;
    filters['view'] = this.view();
    filters['week'] = dateKey(this.weekStart());
    filters['month'] = dateKey(this.monthStart());
    patchListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.careSchedule, { filters });
  });
  error = signal<string | null>(null);
  saving = signal(false);

  readonly seeAll = computed(() => this.session.me()?.role === 'ADMIN' || this.session.me()?.permissions?.schedule === 'all');
  readonly canCreate = computed(() => this.session.can('schedule', 'create'));
  readonly canEdit = computed(() => this.session.can('schedule', 'edit'));
  readonly canDelete = computed(() => this.session.can('schedule', 'delete'));

  readonly monthLabel = computed(() => this.monthStart().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
  readonly isThisMonth = computed(() => {
    const m = this.monthStart();
    const now = new Date();
    return m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
  });
  readonly periodLabel = computed(() => (this.view() === 'month' ? this.monthLabel() : this.weekLabel()));
  readonly isCurrentPeriod = computed(() => (this.view() === 'month' ? this.isThisMonth() : this.isThisCalendarWeek()));

  /** Month grid: 6 weeks from the Monday on or before the 1st; each day's shifts by start time (on the day they start). */
  readonly monthWeeks = computed(() => {
    const start = weekStartOf(this.monthStart());
    const month = this.monthStart().getMonth();
    const byDay = new Map<string, CareShiftDto[]>();
    for (const s of this.shifts()) {
      const k = dateKey(new Date(s.startAt));
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(date.getDate() + w * 7 + d);
        const key = dateKey(date);
        const shifts = (byDay.get(key) ?? []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
        return { key, date, inMonth: date.getMonth() === month, shifts };
      }),
    );
  });
  readonly monthMaxBars = 4;

  barColor(s: CareShiftDto): string {
    return this.colorFor(s);
  }

  barTitle(s: CareShiftDto): string {
    const t = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return [`${t(s.startAt)}–${t(s.endAt)}`, s.clientName, s.worker?.name ?? 'Open shift', s.status === 'CANCELLED' ? 'Cancelled' : null]
      .filter(Boolean)
      .join(' · ');
  }

  moreTitle(shifts: CareShiftDto[]): string {
    return shifts.slice(this.monthMaxBars).map((s) => this.barTitle(s)).join('\n');
  }

  /** Day number in Month view: open that week in Week view. */
  openWeekOf(date: Date) {
    this.weekStart.set(weekStartOf(date));
    this.view.set('week');
  }

  /** Anywhere in a Month day except a shift bar: go to that week in Week view (to add or change shifts). */
  onMonthDayClick(event: MouseEvent, date: Date) {
    if ((event.target as HTMLElement).closest('.mv-bar, .mv-more')) return;
    this.openWeekOf(date);
  }

  /** Day schedule window (from a Month bar or "+N more"): every shift that day, the clicked one highlighted. */
  dayModal = signal<{ key: string; date: Date; focusId: string | null } | null>(null);
  readonly dayModalShifts = computed(() => {
    const m = this.dayModal();
    if (!m) return [];
    return this.shifts()
      .filter((s) => dateKey(new Date(s.startAt)) === m.key)
      .sort((a, b) => a.startAt.localeCompare(b.startAt));
  });

  openDay(date: Date, focusId: string | null) {
    this.dayModal.set({ key: dateKey(date), date, focusId });
  }

  readonly weekLabel = computed(() => {
    const s = this.weekStart();
    const e = new Date(s);
    e.setDate(e.getDate() + 6);
    const fmt = (d: Date, withYear: boolean) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
    return `${fmt(s, false)} – ${fmt(e, true)}`;
  });

  /** Anchor for the week calendar popover (Monday of the visible week). */
  readonly weekPickerDate = computed(() => new Date(this.weekStart()));

  readonly isThisCalendarWeek = computed(() => dateKey(this.weekStart()) === dateKey(weekStartOf(new Date())));

  readonly days = computed(() => {
    const byDay = new Map<string, CareShiftDto[]>();
    for (const s of this.shifts()) {
      const k = dateKey(new Date(s.startAt));
      byDay.set(k, [...(byDay.get(k) ?? []), s]);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(this.weekStart());
      date.setDate(date.getDate() + i);
      const key = dateKey(date);
      const shifts = (byDay.get(key) ?? []).slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      return { key, date, shifts };
    });
  });

  // ── Week grid ──────────────────────────────────────────────────────────────
  readonly hourPx = 48;
  readonly hours = Array.from({ length: 24 }, (_, h) => h);
  private readonly tgBody = viewChild<ElementRef<HTMLElement>>('tgBody');
  /** The week grid needs one client or one worker in focus (people limited to their own shifts always are). */
  readonly hasFocus = computed(() => !this.seeAll() || !!this.clientId() || !!this.workerId());
  /** When the grid appears (a client or worker was picked), size it and scroll to 7 AM. */
  private readonly fitWhenShown = effect(() => {
    const body = this.tgBody()?.nativeElement;
    if (!body) return;
    queueMicrotask(() => {
      this.fitToWindow();
      body.scrollTop = 7 * this.hourPx;
    });
  });

  /** Week grid / month calendar height: from its top down to the bottom of the window. */
  tgHeight = signal<number | null>(null);
  mvHeight = signal<number | null>(null);
  private readonly mvGrid = viewChild<ElementRef<HTMLElement>>('mvGrid');
  private readonly fitMonthWhenShown = effect(() => {
    if (this.mvGrid()) queueMicrotask(() => this.fitToWindow());
  });

  @HostListener('window:resize')
  fitToWindow() {
    const bottomGap = 24;
    const fit = (el: HTMLElement) => Math.max(320, Math.floor(window.innerHeight - el.getBoundingClientRect().top - bottomGap));
    const body = this.tgBody()?.nativeElement;
    if (body) this.tgHeight.set(fit(body));
    const month = this.mvGrid()?.nativeElement;
    if (month) this.mvHeight.set(fit(month));
  }

  /** Schedule tints (--shift-* in _colors.scss); an account always gets the same one. */
  private static readonly COLORS = ['peach', 'green', 'lavender', 'rose', 'cyan'];
  private colorFor(s: CareShiftDto): string {
    const id = s.clientId;
    let h = 0;
    for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return CareSchedulePage.COLORS[h % CareSchedulePage.COLORS.length];
  }

  /** Each day's shift pieces (overnight shifts split at midnight), placed by time; overlaps sit side by side. */
  readonly weekColumns = computed(() => {
    const shifts = this.gridShifts();
    return Array.from({ length: 7 }, (_, i) => {
      const dayStart = new Date(this.weekStart());
      dayStart.setDate(dayStart.getDate() + i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const pieces = shifts
        .map((s) => {
          const a = Math.max(new Date(s.startAt).getTime(), dayStart.getTime());
          const b = Math.min(new Date(s.endAt).getTime(), dayEnd.getTime());
          return b > a
            ? {
                shift: s,
                start: (a - dayStart.getTime()) / 60000,
                end: (b - dayStart.getTime()) / 60000,
                isStart: new Date(s.startAt).getTime() >= dayStart.getTime(),
                isEnd: new Date(s.endAt).getTime() <= dayEnd.getTime(),
              }
            : null;
        })
        .filter((p): p is { shift: CareShiftDto; start: number; end: number; isStart: boolean; isEnd: boolean } => !!p)
        .sort((x, y) => x.start - y.start || y.end - x.end);
      // Lanes within each group of overlapping pieces.
      const placed: { shift: CareShiftDto; start: number; end: number; isStart: boolean; isEnd: boolean; lane: number; group: number }[] = [];
      const groupLanes: number[] = [];
      let group = -1;
      let groupEnd = -1;
      let laneEnds: number[] = [];
      for (const p of pieces) {
        if (p.start >= groupEnd) {
          group++;
          laneEnds = [];
          groupLanes[group] = 0;
        }
        let lane = laneEnds.findIndex((e) => e <= p.start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = p.end;
        groupLanes[group] = Math.max(groupLanes[group], lane + 1);
        groupEnd = Math.max(groupEnd, p.end);
        placed.push({ ...p, lane, group });
      }
      const key = dateKey(dayStart);
      return {
        key,
        segments: placed.map((p) => {
          const lanes = groupLanes[p.group];
          return {
            id: `${p.shift.id}:${key}`,
            shift: p.shift,
            color: this.colorFor(p.shift),
            isStart: p.isStart,
            isEnd: p.isEnd,
            draggable: this.canDragShift(p.shift),
            top: (p.start / 60) * this.hourPx,
            height: Math.max(((p.end - p.start) / 60) * this.hourPx - 2, 20),
            left: `calc(${(p.lane / lanes) * 100}% + 2px)`,
            width: `calc(${100 / lanes}% - 4px)`,
          };
        }),
      };
    });
  });

  // ── Drag shifts: move (body), change start (top edge), change end (bottom edge) ──────────
  /** Live position of the shift being dragged; the grid draws it there until the drop saves. */
  private readonly dragPreview = signal<{ id: string; startAt: string; endAt: string } | null>(null);
  readonly gridShifts = computed(() => {
    const p = this.dragPreview();
    const all = this.shifts();
    return p ? all.map((s) => (s.id === p.id ? { ...s, startAt: p.startAt, endAt: p.endAt } : s)) : all;
  });
  /** 'move' | 'start' | 'end' while a shift is being dragged (sets the grid's cursor). */
  readonly shiftDragMode = signal<'move' | 'start' | 'end' | null>(null);
  private shiftDrag: {
    shift: CareShiftDto;
    mode: 'move' | 'start' | 'end';
    y0: number;
    day0: number;
    origStart: number;
    origEnd: number;
    start: number;
    end: number;
    moved: boolean;
    others: [number, number][];
  } | null = null;

  canDragShift(s: CareShiftDto): boolean {
    return this.canEdit() && s.status !== 'CANCELLED' && !s.visitId;
  }

  /** Minutes from the start of the shown week (local time, DST-safe). */
  private weekMin(d: Date): number {
    const ws = this.weekStart();
    const a = new Date(ws.getFullYear(), ws.getMonth(), ws.getDate()).getTime();
    const b = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((b - a) / 86400000) * 1440 + d.getHours() * 60 + d.getMinutes();
  }
  private fromWeekMin(m: number): Date {
    const ws = this.weekStart();
    const day = Math.floor(m / 1440);
    const rest = m - day * 1440;
    return new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + day, Math.floor(rest / 60), rest % 60);
  }
  private dayIndexAt(clientX: number): number {
    const cols = this.tgBody()?.nativeElement.querySelectorAll<HTMLElement>('.tg-day') ?? [];
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return i;
    }
    if (!cols.length) return 0;
    return clientX < cols[0].getBoundingClientRect().left ? 0 : cols.length - 1;
  }

  onShiftDown(event: MouseEvent, s: CareShiftDto, mode: 'move' | 'start' | 'end') {
    event.stopPropagation(); // never starts an Add shift selection
    if (event.button !== 0 || !this.canDragShift(s)) return;
    if ((event.target as HTMLElement).closest('button, app-row-actions-menu')) return; // the ⋯ menu still clicks
    event.preventDefault(); // no native link/image drag or text selection; a plain click on a link still works
    const start = this.weekMin(new Date(s.startAt));
    const end = this.weekMin(new Date(s.endAt));
    // Can't land on another shift for the same account or the same worker.
    const others = this.shifts()
      .filter((o) => o.id !== s.id && o.status !== 'CANCELLED' && (o.clientId === s.clientId || (!!s.worker && o.worker?.id === s.worker.id)))
      .map((o) => [this.weekMin(new Date(o.startAt)), this.weekMin(new Date(o.endAt))] as [number, number]);
    this.shiftDragMode.set(mode);
    this.shiftDrag = { shift: s, mode, y0: event.clientY, day0: this.dayIndexAt(event.clientX), origStart: start, origEnd: end, start, end, moved: false, others };
  }

  @HostListener('window:mousemove', ['$event'])
  onShiftMove(event: MouseEvent) {
    const d = this.shiftDrag;
    if (!d) return;
    const dy = Math.round(((event.clientY - d.y0) / this.hourPx) * 4) * 15; // 15-minute steps
    let start = d.origStart;
    let end = d.origEnd;
    if (d.mode === 'move') {
      const shift = (this.dayIndexAt(event.clientX) - d.day0) * 1440 + dy;
      start += shift;
      end += shift;
      if (d.others.some(([a, b]) => start < b && end > a)) return; // would overlap: stay at the last free spot
    } else if (d.mode === 'start') {
      const floor = Math.max(-Infinity, ...d.others.filter(([, b]) => b <= d.origStart).map(([, b]) => b));
      start = Math.min(Math.max(d.origStart + dy, floor), d.origEnd - 15);
    } else {
      const ceil = Math.min(Infinity, ...d.others.filter(([a]) => a >= d.origEnd).map(([a]) => a));
      end = Math.max(Math.min(d.origEnd + dy, ceil), d.origStart + 15);
    }
    if (start === d.start && end === d.end) return;
    d.start = start;
    d.end = end;
    d.moved = start !== d.origStart || end !== d.origEnd;
    this.dragPreview.set({ id: d.shift.id, startAt: this.fromWeekMin(start).toISOString(), endAt: this.fromWeekMin(end).toISOString() });
  }

  /** Called from the one window mouseup listener (onSlotUp): Angular keeps only one per event per component. */
  async onShiftUp() {
    const d = this.shiftDrag;
    if (!d) return;
    this.shiftDrag = null;
    this.shiftDragMode.set(null);
    if (!d.moved) {
      this.dragPreview.set(null);
      return;
    }
    // A drag that ends on a link (account, person) must not also follow it.
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
    const startAt = this.fromWeekMin(d.start);
    const endAt = this.fromWeekMin(d.end);
    try {
      const res = await this.care.updateShift(d.shift.id, {
        date: dateKey(startAt),
        startTime: timeKey(startAt),
        endTime: timeKey(endAt),
        timezone: browserTimeZone(),
      });
      this.shifts.update((all) => all.map((s) => (s.id === res.shift.id ? res.shift : s)));
      if (res.conflicts) {
        this.toast.add({
          severity: 'warn',
          summary: 'Overlapping shifts',
          detail: `${res.shift.worker?.name ?? 'This worker'} has ${res.conflicts} other ${res.conflicts === 1 ? 'shift' : 'shifts'} at the same time.`,
          life: 8000,
        });
      }
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not move shift', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.dragPreview.set(null); // on error the block snaps back
    }
  }

  hourLabel(h: number): string {
    if (h === 0) return '12 AM';
    if (h === 12) return '12 PM';
    return h < 12 ? `${h} AM` : `${h - 12} PM`;
  }

  blockTitle(s: CareShiftDto): string {
    return [s.clientName, s.worker?.name ?? 'Open shift', s.repeatLabel, s.notes].filter(Boolean).join(' · ');
  }

  /** Drag over empty hours in one day to pick a time range (inclusive hour indexes); release to add a shift. */
  selection = signal<{ day: string; anchor: number; from: number; to: number } | null>(null);
  private dragging = false;

  private hourAt(event: MouseEvent): number {
    const el = event.currentTarget as HTMLElement;
    const y = event.clientY - el.getBoundingClientRect().top;
    return Math.min(23, Math.max(0, Math.floor(y / this.hourPx)));
  }

  onSlotDown(event: MouseEvent, dayKey: string) {
    if (!this.canCreate() || event.button !== 0) return;
    event.preventDefault(); // no text selection while dragging
    const h = this.hourAt(event);
    this.dragging = true;
    this.selection.set({ day: dayKey, anchor: h, from: h, to: h });
  }

  onSlotMove(event: MouseEvent, dayKey: string) {
    const sel = this.selection();
    if (!this.dragging || !sel || sel.day !== dayKey) return;
    const h = this.hourAt(event);
    const from = Math.min(sel.anchor, h);
    const to = Math.max(sel.anchor, h);
    if (from !== sel.from || to !== sel.to) this.selection.set({ ...sel, from, to });
  }

  @HostListener('window:mouseup')
  onSlotUp() {
    void this.onShiftUp(); // a dragged shift drops here too
    if (!this.dragging) return;
    this.dragging = false;
    const sel = this.selection();
    if (!sel) return;
    this.openNew(sel.day);
    this.fTimesTouched = true; // dragged hours win over open-slot defaults
    const pad = (n: number) => String(n).padStart(2, '0');
    this.fStart = `${pad(sel.from)}:00`;
    this.fEnd = `${pad((sel.to + 1) % 24)}:00`; // a range ending at midnight ends 00:00
  }

  dialogVisible = false;
  editing: CareShiftDto | null = null;
  fClientId: string | null = null;
  fWorkerId: string | null = null;
  fDate = '';
  fStart = '09:00';
  fEnd = '13:00';
  fRepeat = false;
  fWeekdays: number[] = [];
  fUntil = '';
  fNotes = '';
  /** Add shift from a day's schedule window: the date can't be changed. */
  fDateLocked = false;

  constructor() {
    // Start the week grid scrolled to 7 AM; earlier and later hours are a scroll away.
    afterNextRender(() => {
      this.fitToWindow();
      const body = this.tgBody()?.nativeElement;
      if (body) body.scrollTop = 7 * this.hourPx;
    });
    effect(() => {
      this.weekStart();
      this.view();
      this.monthStart();
      this.workerId();
      this.clientId();
      void this.load();
    });
  }

  async ngOnInit() {
    // ?new=1 opens Add shift (from a client's Care tab).
    if (this.route.snapshot.queryParamMap.get('new') && this.canCreate()) this.openNew();
    if (this.seeAll()) {
      try {
        this.workers.set(teamUsersToOptions(await this.care.workers()));
      } catch {
        this.workers.set([]);
      }
    }
  }

  async load() {
    const month = this.view() === 'month';
    if (!month && !this.hasFocus()) {
      this.shifts.set([]);
      return;
    }
    const from = month ? weekStartOf(this.monthStart()) : this.weekStart();
    const to = new Date(from);
    to.setDate(to.getDate() + (month ? 42 : 7));
    try {
      this.shifts.set(
        await this.care.shifts({ from: from.toISOString(), to: to.toISOString(), userId: this.workerId(), clientId: this.clientId() }),
      );
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load the schedule');
    }
  }

  movePeriod(n: number) {
    if (this.view() === 'month') {
      const m = this.monthStart();
      this.monthStart.set(new Date(m.getFullYear(), m.getMonth() + n, 1));
    } else {
      this.moveWeek(n);
    }
  }

  thisPeriod() {
    const now = new Date();
    if (this.view() === 'month') this.monthStart.set(new Date(now.getFullYear(), now.getMonth(), 1));
    else this.thisWeek();
  }

  moveWeek(n: number) {
    const d = new Date(this.weekStart());
    d.setDate(d.getDate() + 7 * n);
    this.weekStart.set(d);
  }

  thisWeek() {
    this.weekStart.set(weekStartOf(new Date()));
  }

  jumpToWeek(selected: Date, popover: { hide(): void }) {
    this.weekStart.set(weekStartOf(selected));
    this.monthStart.set(new Date(selected.getFullYear(), selected.getMonth(), 1));
    popover.hide();
  }

  rowActions(s: CareShiftDto): RowActionItem[] {
    const me = this.session.me()?.id;
    const items: RowActionItem[] = [];
    if (s.visitId) {
      items.push({ id: 'visit', label: 'Open visit', icon: 'pi pi-arrow-right', command: () => void this.router.navigate(['/care/visits', s.visitId]) });
    } else if (s.status === 'SCHEDULED' && s.worker?.id === me && this.session.can('visits', 'create')) {
      items.push({ id: 'start', label: 'Start visit', icon: 'pi pi-play', command: () => void this.startVisit(s) });
    }
    if (this.canEdit()) {
      items.push({ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(s) });
      items.push(
        s.status === 'SCHEDULED'
          ? { id: 'cancel', label: 'Cancel shift', icon: 'pi pi-ban', severity: 'warn', command: () => void this.setCancelled(s, true) }
          : { id: 'restore', label: 'Restore shift', icon: 'pi pi-replay', command: () => void this.setCancelled(s, false) },
      );
    }
    if (this.canDelete()) {
      if (!s.visitId) items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(s, false) });
      if (s.seriesId) items.push({ id: 'delete-following', label: 'Delete this and following', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(s, true) });
    }
    return items;
  }

  /** @param dayKey YYYY-MM-DD for that column; defaults to today-or-first day in view. */
  /** The day window shows its shift list, or the Add shift form in place of it. */
  dayMode = signal<'list' | 'add'>('list');

  /** Add shift inside the day window: that day, date locked (repeat still allowed, starting that day). */
  addShiftForDay() {
    const m = this.dayModal();
    if (!m) return;
    this.openNew(m.key);
    this.dialogVisible = false; // the form shows in the day window, not the separate dialog
    this.fDateLocked = true;
    this.dayMode.set('add');
  }

  /** Save from the day window: back to the day's list (now with the new shift). */
  async saveDayShift() {
    if (await this.save()) this.dayMode.set('list');
  }

  /** Close the day window (Cancel on its Add shift form closes it too). */
  closeDay() {
    this.dayModal.set(null);
    this.dayMode.set('list');
  }

  /** True once Start/End were set by hand (or by drag): client changes then leave them alone. */
  fTimesTouched = false;

  /** Client changed in the shift form: re-default Start/End to that client's open slot. */
  onFormClientChange() {
    if (!this.editing && !this.fTimesTouched) this.applyOpenSlot();
  }

  /**
   * Default Start/End to a slot the client isn't already covered that day (4 hours, like the base default):
   * start where the day's last shift ends; if that runs to midnight, the first earlier gap. No client or no
   * shifts that day → 9:00 AM–1:00 PM.
   */
  private applyOpenSlot() {
    const LEN = 240;
    const toKey = (m: number) => {
      const w = ((m % 1440) + 1440) % 1440;
      return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
    };
    let start = 9 * 60;
    let end = 13 * 60;
    if (this.fClientId && this.fDate) {
      const [y, mo, d] = this.fDate.split('-').map(Number);
      const day0 = new Date(y, mo - 1, d).getTime();
      const busy = this.shifts()
        .filter((sh) => sh.clientId === this.fClientId)
        .map((sh) => [(new Date(sh.startAt).getTime() - day0) / 60000, (new Date(sh.endAt).getTime() - day0) / 60000])
        .filter(([a, b]) => b > 0 && a < 1440) // touches this day (incl. overnight spill-in)
        .map(([a, b]) => [Math.max(0, a), Math.min(1440, b)])
        .sort((a, b) => a[0] - b[0]);
      if (busy.length) {
        const up15 = (m: number) => Math.ceil(m / 15) * 15;
        const lastEnd = up15(Math.max(...busy.map((b) => b[1])));
        if (lastEnd < 1440) {
          start = lastEnd;
          end = start + LEN; // may run past midnight (overnight shift)
        } else {
          // Covered to midnight: first gap from the start of the day.
          let cursor = 0;
          let found = false;
          for (const [a, b] of busy) {
            if (a - cursor >= 15) {
              start = cursor;
              end = Math.min(a, cursor + LEN);
              found = true;
              break;
            }
            cursor = Math.max(cursor, up15(b));
          }
          if (!found) {
            start = 9 * 60; // fully booked: leave the base default
            end = 13 * 60;
          }
        }
      }
    }
    this.fStart = toKey(start);
    this.fEnd = toKey(end);
  }

  openNew(dayKey?: string, clientId?: string) {
    this.editing = null;
    this.fDateLocked = false;
    this.fClientId = clientId ?? this.clientId();
    this.fWorkerId = this.seeAll() ? this.workerId() : (this.session.me()?.id ?? null);
    const fallback = this.days().find((d) => d.key >= this.todayKey)?.key ?? this.days()[0].key;
    this.fDate = dayKey ?? fallback;
    this.fTimesTouched = false;
    this.applyOpenSlot();
    this.fRepeat = false;
    this.fWeekdays = [];
    this.fUntil = '';
    this.fNotes = '';
    this.dialogVisible = true;
  }

  openEdit(s: CareShiftDto) {
    this.fDateLocked = false;
    this.editing = s;
    this.fClientId = s.clientId;
    this.fWorkerId = s.worker?.id ?? null;
    const start = new Date(s.startAt);
    this.fDate = dateKey(start);
    this.fStart = timeKey(start);
    this.fEnd = timeKey(new Date(s.endAt));
    this.fRepeat = false;
    this.fNotes = s.notes ?? '';
    this.dialogVisible = true;
  }

  canSave() {
    if (!this.fClientId || !this.fDate || !this.fStart || !this.fEnd) return false;
    if (!this.editing && this.fRepeat && !this.fWeekdays.length) return false;
    return true;
  }

  async save(): Promise<boolean> {
    this.saving.set(true);
    try {
      const base = {
        clientId: this.fClientId!,
        userId: this.seeAll() ? this.fWorkerId : (this.session.me()?.id ?? null),
        date: this.fDate,
        startTime: this.fStart,
        endTime: this.fEnd,
        timezone: browserTimeZone(),
        notes: this.fNotes.trim() || null,
      };
      const res = this.editing
        ? await this.care.updateShift(this.editing.id, base)
        : await this.care.createShift({ ...base, ...(this.fRepeat ? { repeat: { weekdays: this.fWeekdays, ...(this.fUntil ? { until: this.fUntil } : {}) } } : {}) });
      this.dialogVisible = false;
      if (res.conflicts) {
        this.toast.add({
          severity: 'warn',
          summary: 'Overlapping shifts',
          detail: `${res.shift.worker?.name ?? 'This worker'} has ${res.conflicts} other ${res.conflicts === 1 ? 'shift' : 'shifts'} at the same time.`,
          life: 8000,
        });
      }
      await this.load();
      return true;
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
      return false;
    } finally {
      this.saving.set(false);
    }
  }

  async setCancelled(s: CareShiftDto, cancelled: boolean) {
    try {
      if (cancelled) await this.care.cancelShift(s.id);
      else await this.care.restoreShift(s.id);
      await this.load();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not update', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  confirmDelete(s: CareShiftDto, following: boolean) {
    this.confirm.confirm({
      message: following
        ? `Delete this shift and every later shift in the series (${s.repeatLabel})? Shifts that already have a visit stay. This cannot be undone.`
        : `Delete this shift at ${s.clientName}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.care.deleteShift(s.id, following);
          await this.load();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
        }
      },
    });
  }

  async startVisit(s: CareShiftDto) {
    try {
      const visit = await this.care.createVisit({ clientId: s.clientId, shiftId: s.id });
      await this.router.navigate(['/care/visits', visit.id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start the visit', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    }
  }
}
