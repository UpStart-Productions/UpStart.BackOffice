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
import { DashboardPanelComponent } from '../../ui/dashboard-panel/dashboard-panel.component';
import { PageComponent } from '../../ui/layout/page.component';
import { QueueCardComponent } from '../../ui/queue-card/queue-card.component';
import { invoiceDueFlag, isUnpaidInvoiceStatus, sortInvoicesForAttention } from '../invoices/invoice-status.util';
import type { TimeEntry } from '../time-entry/time-entry.types';
import { addDays, dateKey, endOfWeek, formatDurationMin, formatElapsed, startOfWeek } from '../time-entry/timesheet.utils';

/** How many rows each card lists before "Open in …" takes over. */
const LIST_LIMIT = 6;
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
};

type PanelId = 'tasks' | 'time' | 'nextSteps' | 'invoices' | 'replies' | 'quiet' | 'bookings';
type Panel = { id: PanelId; area: PermissionArea };

/** Default order. Every panel is one column of three. */
const PANELS: Panel[] = [
  { id: 'tasks', area: 'tasks' },
  { id: 'time', area: 'time' },
  { id: 'nextSteps', area: 'inbox' },
  { id: 'invoices', area: 'invoices' },
  { id: 'replies', area: 'inbox' },
  { id: 'quiet', area: 'inbox' },
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

/** Due-date tone → .side-list-value modifier. */
function toneClass(tone: string): string {
  return tone === 'overdue' || tone === 'today' || tone === 'soon' ? `side-list-value--${tone}` : '';
}

/**
 * Dashboard: what needs the signed-in person today. Count cards open the matching queue or list; the cards below
 * show the top few items. Every section is gated by the role's areas. Mine / Everyone's applies to Activity
 * queues and invoices; tasks and time are always your own.
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

  readonly listLimit = LIST_LIMIT;

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
    this.savedOrder.set(ids);
    try {
      localStorage.setItem(this.orderKey(), JSON.stringify(ids));
    } catch {
      // Order just won't be remembered.
    }
  }

  private loadOrder() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.orderKey()) ?? '[]');
      if (Array.isArray(parsed)) this.savedOrder.set(parsed.filter((x): x is string => typeof x === 'string'));
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
    return running ? formatElapsed(Date.now() - new Date(running.startedAt).getTime()) : '';
  });
  readonly todayLabel = computed(() => formatDurationMin(this.minutesSince(dateKey(new Date()))));
  readonly weekLabel = computed(() => formatDurationMin(this.minutesSince(dateKey(startOfWeek(new Date())))));

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

  replyDetail(r: QueueRow): string {
    return r.clientId && r.person ? `${r.person}: ${r.title}` : r.title;
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
