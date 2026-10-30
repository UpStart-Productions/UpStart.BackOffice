import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { areaLevel, type PermissionArea } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { ActivityQueues, CommunicationsApi, QueueRow, relativeTime } from '../../core/communications.api';
import { SessionService } from '../../core/session.service';
import { lastContactLabel } from '../../core/staleness.util';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { addDaysKey, dueLabel, dueTone, todayKey } from '../../task-manager/core/tm-format.util';
import { MyTask } from '../../task-manager/core/tm.types';
import { DashboardPanelComponent, DashboardPanelTab } from '../../ui/dashboard-panel/dashboard-panel.component';
import { PageComponent } from '../../ui/layout/page.component';
import { QueueCardComponent } from '../../ui/queue-card/queue-card.component';
import { invoiceDueFlag, isUnpaidInvoiceStatus, sortInvoicesForAttention } from '../invoices/invoice-status.util';
import type { TimeEntry } from '../time-entry/time-entry.types';
import { addDays, dateKey, endOfWeek, formatDurationMin, formatElapsed, startOfWeek } from '../time-entry/timesheet.utils';

/** Tasks, next steps and bookings this many days ahead count as coming up. */
const LOOKAHEAD_DAYS = 7;

type Invoice = {
  id: string;
  number?: number;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  total: number | string;
  amountPaid?: number | string | null;
  billToName?: string | null;
  client: { id: string; name: string } | null;
  createdBy?: { id: string } | null;
};

type Booking = {
  id: string;
  startAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestOrg: string | null;
  bookingType: { id: string; name: string } | null;
  lead: { id: string } | null;
};

type PanelId = 'tasks' | 'time' | 'activity' | 'invoices' | 'bookings';
type ActivityTab = 'replies' | 'nextSteps' | 'quiet';
type Panel = { id: PanelId; area: PermissionArea; wide?: boolean };

/** The three old Activity cards, collapsed into the Activity panel wherever the first of them sat. */
const LEGACY_ACTIVITY_IDS = new Set(['nextSteps', 'replies', 'quiet', 'activity']);

/** Default order. Activity is two columns wide and sits beside My tasks. */
const PANELS: Panel[] = [
  { id: 'tasks', area: 'tasks' },
  { id: 'activity', area: 'inbox', wide: true },
  { id: 'time', area: 'time' },
  { id: 'invoices', area: 'invoices' },
  { id: 'bookings', area: 'bookings' },
];

/** Each person's panel order, per browser (same approach as Task Manager board prefs). */
const ORDER_KEY = 'ubo-dashboard-panel-order:v1';

type Section<T> = { loading: boolean; error: string | null; data: T };

function section<T>(data: T): Section<T> {
  return { loading: true, error: null, data };
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Collapse the old Next steps / Needs reply / Gone quiet cards into one Activity card, in the first one's place. */
function migratePanelOrder(ids: string[]): string[] {
  const index = ids.findIndex((id) => LEGACY_ACTIVITY_IDS.has(id));
  if (index === -1) return ids;
  const before = ids.slice(0, index).filter((id) => !LEGACY_ACTIVITY_IDS.has(id));
  const after = ids.slice(index + 1).filter((id) => !LEGACY_ACTIVITY_IDS.has(id));
  return packWidePanel([...before, 'activity', ...after]);
}

/**
 * Activity is two columns wide. If it would start in the last column, slide it one spot left
 * so the row doesn't end with an empty cell.
 */
function packWidePanel(ids: string[]): string[] {
  const index = ids.indexOf('activity');
  if (index < 2 || index % 3 !== 2) return ids;
  const next = [...ids];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

/** Due-date tone → .side-list-value modifier. */
function toneClass(tone: string): string {
  return tone === 'overdue' || tone === 'today' || tone === 'soon' ? `side-list-value--${tone}` : '';
}

/**
 * Dashboard: what needs the signed-in person today. Count cards open the matching queue or list; the cards below
 * show the items and scroll once they get tall. Activity (Needs reply, Next steps, Gone quiet) is one card.
 * Every section is gated by the role's areas. Mine / Everyone's applies to Activity queues and invoices;
 * tasks and time are always your own.
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [FormsModule, RouterLink, CdkDrag, CdkDropList, ButtonModule, SelectButtonModule, DashboardPanelComponent, PageComponent, QueueCardComponent],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly tm = inject(TmApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  readonly scopeOptions = [
    { label: 'Mine', value: true },
    { label: "Everyone's", value: false },
  ];
  readonly mine = signal(true);

  readonly queues = signal<Section<ActivityQueues | null>>(section(null));
  readonly tasks = signal<Section<MyTask[]>>(section([]));
  readonly time = signal<Section<TimeEntry[]>>(section([]));
  readonly invoices = signal<Section<Invoice[]>>(section([]));
  readonly bookings = signal<Section<Booking[]>>(section([]));

  /** Ticks every second so the running timer counts up. */
  private readonly tick = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly stopping = signal(false);

  /** Which list the Activity card is showing. The footer link opens that same list. */
  readonly activityTab = signal<ActivityTab>('replies');

  // ── Access ───────────────────────────────────────────────────────────────

  can(area: PermissionArea): boolean {
    return !!areaLevel(this.session.me(), area);
  }

  /** The toggle only matters when the role can see other people's queues or invoices. */
  readonly showScope = computed(() => this.can('inbox') || areaLevel(this.session.me(), 'invoices') === 'all');

  // ── Panels (drag to reorder) ─────────────────────────────────────────────

  private readonly savedOrder = signal<string[]>([]);

  /** Panels the role can use, in the person's saved order; new panels go after, in default order. */
  readonly panels = computed(() => {
    const allowed = PANELS.filter((p) => this.can(p.area));
    const rank = new Map(this.savedOrder().map((id, i) => [id, i]));
    return allowed
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (rank.get(a.p.id) ?? PANELS.length + a.i) - (rank.get(b.p.id) ?? PANELS.length + b.i))
      .map(({ p }) => p);
  });

  onPanelDrop(event: CdkDragDrop<Panel[]>) {
    if (event.previousIndex === event.currentIndex) return;
    const ids = this.panels().map((p) => p.id);
    moveItemInArray(ids, event.previousIndex, event.currentIndex);
    const packed = packWidePanel(ids);
    this.savedOrder.set(packed);
    try {
      localStorage.setItem(this.orderKey(), JSON.stringify(packed));
    } catch {
      // Order just won't be remembered.
    }
  }

  private loadOrder() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.orderKey()) ?? '[]');
      if (!Array.isArray(parsed)) return;
      const ids = parsed.filter((x): x is string => typeof x === 'string');
      const migrated = migratePanelOrder(ids);
      this.savedOrder.set(migrated);
      if (migrated.join() !== ids.join()) {
        localStorage.setItem(this.orderKey(), JSON.stringify(migrated));
      }
    } catch {
      // Ignore bad stored data.
    }
  }

  private orderKey(): string {
    return `${ORDER_KEY}:${this.session.me()?.id ?? 'anon'}`;
  }

  // ── Activity queues ──────────────────────────────────────────────────────

  readonly counts = computed(() => this.queues().data?.counts ?? null);
  readonly needsReplyDays = computed(() => this.queues().data?.thresholds.needsReplyDays ?? 2);

  readonly nextSteps = computed<QueueRow[]>(() => {
    const horizon = addDaysKey(todayKey(), LOOKAHEAD_DAYS);
    return (this.queues().data?.nextStep ?? []).filter((r) => r.overdue || r.dueToday || (r.at && dateKey(new Date(r.at)) <= horizon));
  });
  readonly replies = computed(() => this.queues().data?.reply ?? []);
  readonly quiet = computed(() => this.queues().data?.quiet ?? []);

  readonly activityTabs = computed<DashboardPanelTab[]>(() => [
    { id: 'replies', label: 'Needs reply', count: this.replies().length, countTone: 'danger' },
    { id: 'nextSteps', label: 'Next steps', count: this.nextSteps().length, countTone: 'warning' },
    { id: 'quiet', label: 'Gone quiet', count: this.quiet().length, countTone: 'info' },
  ]);

  /** Footer opens the Activity list that matches the tab. Needs reply is the page default. */
  readonly activityQuery = computed(() => {
    switch (this.activityTab()) {
      case 'nextSteps':
        return { queue: 'nextStep' };
      case 'quiet':
        return { queue: 'quiet' };
      default:
        return null;
    }
  });

  // ── Tasks (always mine) ──────────────────────────────────────────────────

  readonly upcomingTasks = computed(() => {
    const horizon = addDaysKey(todayKey(), LOOKAHEAD_DAYS);
    return this.tasks()
      .data.filter((t) => !t.isCompleted && t.dueOn && t.dueOn <= horizon)
      .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || a.name.localeCompare(b.name));
  });
  readonly tasksDueCount = computed(() => {
    const today = todayKey();
    return this.tasks().data.filter((t) => !t.isCompleted && t.dueOn && t.dueOn <= today).length;
  });

  // ── Time (always mine) ───────────────────────────────────────────────────

  readonly runningEntry = computed(() => this.time().data.find((e) => !e.stoppedAt) ?? null);
  readonly elapsedLabel = computed(() => {
    this.tick();
    const running = this.runningEntry();
    return running ? this.withHrs(formatElapsed(Date.now() - new Date(running.startedAt).getTime())) : '';
  });
  readonly todayLabel = computed(() => formatDurationMin(this.minutesSince(dateKey(new Date()))));
  readonly weekLabel = computed(() => formatDurationMin(this.minutesSince(dateKey(startOfWeek(new Date())))));
  /** This week's entries, newest first. The prior week is loaded only so a timer left running still shows. */
  readonly weekEntries = computed(() => {
    const weekStart = dateKey(startOfWeek(new Date()));
    return this.time().data
      .filter((e) => dateKey(new Date(e.startedAt)) >= weekStart)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  });

  // ── Invoices (Mine = ones you created) ───────────────────────────────────

  readonly scopedInvoices = computed(() => {
    const all = this.invoices().data;
    const me = this.session.me()?.id;
    return this.mine() && me ? all.filter((i) => i.createdBy?.id === me) : all;
  });
  private readonly openInvoices = computed(() => this.scopedInvoices().filter((i) => i.status === 'SENT' && isUnpaidInvoiceStatus(i.status)));
  readonly outstandingTotal = computed(() => this.openInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly overdueInvoices = computed(() => this.openInvoices().filter((i) => invoiceDueFlag(i.dueDate, i.status) === 'overdue'));
  readonly overdueTotal = computed(() => this.overdueInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly draftCount = computed(() => this.scopedInvoices().filter((i) => i.status === 'DRAFT').length);
  readonly attentionInvoices = computed(() => sortInvoicesForAttention(this.openInvoices().filter((i) => !!i.dueDate)));

  // ── Bookings ─────────────────────────────────────────────────────────────

  readonly upcomingBookings = computed(() => {
    const now = Date.now();
    const horizon = addDays(new Date(), LOOKAHEAD_DAYS).getTime();
    return this.bookings().data.filter((b) => {
      const t = new Date(b.startAt).getTime();
      return b.status === 'CONFIRMED' && t >= now && t <= horizon;
    });
  });

  constructor() {
    // Mine / Everyone's re-reads the queues; invoices filter in place.
    effect(() => {
      const mine = this.mine();
      untracked(() => {
        if (this.can('inbox')) void this.loadQueues(mine);
      });
    });
  }

  ngOnInit() {
    this.loadOrder();
    this.timer = setInterval(() => this.tick.update((n) => n + 1), 1000);
    if (this.can('tasks')) void this.loadTasks();
    if (this.can('time')) void this.loadTime();
    if (this.can('invoices')) void this.loadInvoices();
    if (this.can('bookings')) void this.loadBookings();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  async stopTimer() {
    const running = this.runningEntry();
    if (!running || this.stopping()) return;
    this.stopping.set(true);
    try {
      await this.api.post(`/time-entries/${running.id}/stop`);
      await this.loadTime();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not stop timer', detail: errorText(err, 'Failed') });
    } finally {
      this.stopping.set(false);
    }
  }

  // ── Labels ───────────────────────────────────────────────────────────────

  taskDue(t: MyTask): string {
    return dueLabel(t.dueOn);
  }

  taskTone(t: MyTask): string {
    return toneClass(dueTone(t.dueOn, t.isCompleted));
  }

  nextStepDue(r: QueueRow): string {
    return r.at ? dueLabel(dateKey(new Date(r.at))) : 'No date';
  }

  nextStepTone(r: QueueRow): string {
    return r.overdue ? toneClass('overdue') : r.dueToday ? toneClass('today') : '';
  }

  nextStepDetail(r: QueueRow): string {
    return !this.mine() && r.owner ? `${r.title}, ${r.owner}` : r.title;
  }


  invoiceBalance(i: Invoice): number {
    return this.balance(i);
  }

  waiting(r: QueueRow): string {
    return r.at ? relativeTime(r.at) : '';
  }

  lastContact(r: QueueRow): string {
    return lastContactLabel(r.at);
  }

  invoiceDue(i: Invoice): string {
    return i.dueDate ? dueLabel(dateKey(new Date(i.dueDate))) : '';
  }

  invoiceTone(i: Invoice): string {
    return invoiceDueFlag(i.dueDate, i.status) === 'overdue' ? toneClass('overdue') : '';
  }

  timeDate(e: TimeEntry): string {
    return dueLabel(dateKey(new Date(e.startedAt)));
  }

  /** Note under a time row when it is not a work task (those link on their own). */
  timeNote(e: TimeEntry): string {
    return e.description?.trim() || e.projectTask?.name || '';
  }

  timeDuration(e: TimeEntry): string {
    this.tick();
    if (!e.stoppedAt) {
      const min = Math.max(0, Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60_000));
      return this.withHrs(formatDurationMin(min));
    }
    return this.withHrs(formatDurationMin(e.durationMin ?? 0));
  }

  /** Timer and entry rows include the unit in the string. Today and This week style it separately. */
  private withHrs(value: string): string {
    return `${value} hrs`;
  }

  bookingWhen(b: Booking): string {
    const d = new Date(b.startAt);
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${dueLabel(dateKey(d))} ${time}`;
  }

  money(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  private balance(i: Invoice): number {
    return Math.max(0, Number(i.total ?? 0) - Number(i.amountPaid ?? 0));
  }

  /** Minutes logged from a day (YYYY-MM-DD) through now, counting the running timer. */
  private minutesSince(fromKey: string): number {
    this.tick();
    let total = 0;
    for (const e of this.time().data) {
      if (dateKey(new Date(e.startedAt)) < fromKey) continue;
      total += e.stoppedAt ? (e.durationMin ?? 0) : Math.max(0, Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60_000));
    }
    return total;
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  private async loadQueues(mine: boolean) {
    this.queues.update((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await this.comms.queues({ mine });
      this.queues.set({ loading: false, error: null, data });
    } catch (err) {
      this.queues.set({ loading: false, error: errorText(err, 'Could not load Activity'), data: null });
    }
  }

  private async loadTasks() {
    try {
      this.tasks.set({ loading: false, error: null, data: await this.tm.myTasks() });
    } catch (err) {
      this.tasks.set({ loading: false, error: errorText(err, 'Could not load tasks'), data: [] });
    }
  }

  /**
   * Your entries from a week before this week starts, so a timer left running over the weekend still shows.
   * Today and This week only count entries from their own start dates.
   */
  private async loadTime() {
    try {
      const weekStart = startOfWeek(new Date());
      const from = addDays(weekStart, -7).toISOString();
      const to = endOfWeek(weekStart).toISOString();
      const me = this.session.me()?.id;
      const user = me ? `&userId=${encodeURIComponent(me)}` : '';
      const data = await this.api.get<TimeEntry[]>(`/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${user}`);
      this.time.set({ loading: false, error: null, data });
    } catch (err) {
      this.time.set({ loading: false, error: errorText(err, 'Could not load time'), data: [] });
    }
  }

  private async loadInvoices() {
    try {
      this.invoices.set({ loading: false, error: null, data: await this.api.get<Invoice[]>('/invoices') });
    } catch (err) {
      this.invoices.set({ loading: false, error: errorText(err, 'Could not load invoices'), data: [] });
    }
  }

  private async loadBookings() {
    try {
      const data = await this.api.get<Booking[]>('/booking/admin/bookings?status=CONFIRMED');
      this.bookings.set({ loading: false, error: null, data });
    } catch (err) {
      this.bookings.set({ loading: false, error: errorText(err, 'Could not load bookings'), data: [] });
    }
  }
}
