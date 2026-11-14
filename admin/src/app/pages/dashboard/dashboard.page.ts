import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';
import {
  areaLevel,
  isAdminRole,
  type CareShiftDto,
  type PendingSubmissionDto,
  type PermissionArea,
} from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { CareApi } from '../../core/care.api';
import { FormsApi } from '../../core/forms.api';
import { ActivityQueues, CommunicationsApi, QueueRow, relativeTime } from '../../core/communications.api';
import { PipelinesApi, PipelineSummary } from '../../core/pipelines.api';
import { SessionService } from '../../core/session.service';
import { lastContactLabel } from '../../core/staleness.util';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { addDaysKey, dueLabel, dueTone, personDisplayName, todayKey } from '../../task-manager/core/tm-format.util';
import { MyTask, Person } from '../../task-manager/core/tm.types';
import { ReportChartComponent } from '../../ui/charts/report-chart.component';
import { DashboardPanelComponent, DashboardPanelColor } from '../../ui/dashboard-panel/dashboard-panel.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RecordCardComponent, RecordCardTone } from '../../ui/record-card/record-card.component';
import { invoiceDueFlag, isUnpaidInvoiceStatus } from '../invoices/invoice-status.util';
import type { TimeEntry } from '../time-entry/time-entry.types';
import { addDays, dateKey, endOfWeek, formatDurationMin, formatElapsed, startOfWeek } from '../time-entry/timesheet.utils';

/** Tasks, next steps and bookings this many days ahead count as coming up. */
const LOOKAHEAD_DAYS = 7;
/** Next steps overdue longer than this collapse into one "clean up" line instead of shouting in red. */
const STALE_DAYS = 30;
/** "Since you were last here" looks back this far. */
const FEED_DAYS = 7;

type Invoice = {
  id: string;
  number?: number;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  paidAt?: string | null;
  sentAt?: string | null;
  total: number | string;
  amountPaid?: number | string | null;
  billToName?: string | null;
  client: { id: string; name: string } | null;
  createdBy?: { id: string } | null;
};

type Booking = {
  id: string;
  startAt: string;
  createdAt?: string;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestOrg: string | null;
  bookingType: { id: string; name: string } | null;
  lead: { id: string } | null;
};

type Lead = {
  id: string;
  organization: string;
  stageId: string | null;
  estimatedValue?: number | null;
  invoiceId?: string | null;
  projectId?: string | null;
  trackedClientId?: string | null;
};

type Unbilled = {
  total: number;
  hours: number;
  expenseAmount: number;
  clients: { clientId: string; clientName: string; hours: number; total: number; missingRateHours: number; since: string | null }[];
};

type Weather = {
  place: string;
  temp: number;
  high: number;
  low: number;
  precipChance: number | null;
  code: number;
  isDay: boolean;
  summary: string;
};

type ProfitLoss = { totalRevenue: number; totalExpenses: number; netIncome: number };

/** One row on the dashboard: a record card plus an optional badge and action. */
export type DashRow = {
  key: string;
  title: string;
  subtitle?: string;
  link?: unknown[] | string | null;
  query?: Record<string, string> | null;
  icon?: string;
  tone?: RecordCardTone;
  person?: Person | null;
  badge?: { label: string; severity: 'success' | 'info' | 'warn' | 'danger' | 'secondary'; hint?: string };
  action?: { label: string; link: unknown[] | string; query?: Record<string, string> | null; primary?: boolean };
  done?: () => Promise<void>;
  isNew?: boolean;
  at?: string;
};

type PanelId = 'money' | 'today' | 'work' | 'pipeline' | 'feed' | 'time' | 'shifts';
/** Card width: full row, half a row, or a third of a row. */
export type PanelSize = 'full' | 'half' | 'third';
type Panel = { id: PanelId; size: PanelSize; visible: (d: DashboardPage) => boolean };

/** Default order and widths. The grid back-fills gaps so rows stay full after a drag. */
const PANELS: Panel[] = [
  { id: 'money', size: 'full', visible: (d) => d.can('invoices') },
  { id: 'today', size: 'half', visible: (d) => d.can('tasks') || d.can('inbox') || d.can('bookings') || d.can('forms') || d.can('schedule') },
  { id: 'work', size: 'half', visible: (d) => d.can('tasks') },
  { id: 'pipeline', size: 'third', visible: (d) => d.can('pipeline') || d.can('inbox') },
  { id: 'feed', size: 'third', visible: (d) => d.can('invoices') || d.can('inbox') || d.can('forms') || d.can('bookings') || d.can('tasks') },
  { id: 'time', size: 'third', visible: (d) => d.can('time') },
  { id: 'shifts', size: 'third', visible: (d) => d.can('schedule') },
];

/**
 * Weather preview: /dashboard?wx=clear-day (or clear-night, partly-day, partly-night, cloudy, fog, rain, snow, storm)
 * paints that sky with sample numbers, for checking the look without waiting for the weather.
 */
const WX_PREVIEW: Record<string, { code: number; isDay: boolean; summary: string; temp: number; high: number; low: number; precipChance: number | null }> = {
  'clear-day': { code: 0, isDay: true, summary: 'Clear', temp: 72, high: 76, low: 54, precipChance: 0 },
  'clear-night': { code: 0, isDay: false, summary: 'Clear', temp: 48, high: 64, low: 44, precipChance: 0 },
  'partly-day': { code: 2, isDay: true, summary: 'Partly cloudy', temp: 61, high: 65, low: 47, precipChance: 10 },
  'partly-night': { code: 2, isDay: false, summary: 'Partly cloudy', temp: 46, high: 58, low: 41, precipChance: 10 },
  cloudy: { code: 3, isDay: true, summary: 'Cloudy', temp: 55, high: 57, low: 46, precipChance: 15 },
  fog: { code: 45, isDay: true, summary: 'Fog', temp: 49, high: 55, low: 43, precipChance: 5 },
  rain: { code: 63, isDay: true, summary: 'Rain', temp: 51, high: 53, low: 45, precipChance: 90 },
  snow: { code: 73, isDay: true, summary: 'Snow', temp: 29, high: 31, low: 22, precipChance: 80 },
  storm: { code: 95, isDay: true, summary: 'Thunderstorms', temp: 66, high: 71, low: 58, precipChance: 85 },
};

/** Each person's card order, per browser. v2: the redesigned cards. */
const ORDER_KEY = 'ubo-dashboard-panel-order:v2';
/** When this person last opened the Dashboard (for "New" in the feed and My work). */
const LAST_VISIT_KEY = 'ubo-dashboard-last-visit:v1';

type Section<T> = { loading: boolean; error: string | null; data: T };

function section<T>(data: T): Section<T> {
  return { loading: true, error: null, data };
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message.replace(/^API error \d+: /, '') : fallback;
}

function daysBetween(fromIso: string, to = Date.now()): number {
  return Math.floor((to - new Date(fromIso).getTime()) / 86_400_000);
}

function monthStart(offset = 0): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + offset, 1);
}

/**
 * Dashboard: how the business is doing and what needs you today. Each card covers one part of the work:
 * Financial health, Today (everything due, in one list), My work (tasks with who gave them to you),
 * Pipeline & relationships, Since you were last here, My time, and My shifts for care staff.
 * Every card is gated by the role's areas. Mine / Everyone's applies to Activity queues and invoices.
 */
@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    CdkDrag,
    CdkDropList,
    ButtonModule,
    SelectButtonModule,
    TagModule,
    TooltipModule,
    LucideIconComponent,
    DashboardPanelComponent,
    PageComponent,
    RecordCardComponent,
    ReportChartComponent,
  ],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly tm = inject(TmApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);
  private readonly formsApi = inject(FormsApi);
  private readonly care = inject(CareApi);
  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly scopeOptions = [
    { label: 'Mine', value: true },
    { label: "Everyone's", value: false },
  ];
  readonly mine = signal(true);
  /** Dark hover hints wait half a second. */
  readonly tipDelay = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;

  readonly queues = signal<Section<ActivityQueues | null>>(section(null));
  readonly tasks = signal<Section<MyTask[]>>(section([]));
  readonly time = signal<Section<TimeEntry[]>>(section([]));
  readonly invoices = signal<Section<Invoice[]>>(section([]));
  readonly unbilled = signal<Section<Unbilled | null>>(section(null));
  readonly pnl = signal<Section<ProfitLoss | null>>(section(null));
  readonly bookings = signal<Section<Booking[]>>(section([]));
  readonly submissions = signal<Section<PendingSubmissionDto[]>>(section([]));
  readonly shifts = signal<Section<CareShiftDto[]>>(section([]));
  readonly pipelines = signal<Section<PipelineSummary[]>>(section([]));
  readonly leads = signal<Section<Lead[]>>(section([]));
  readonly startingShift = signal<string | null>(null);
  readonly weather = signal<Weather | null>(null);
  /** Weather is for this browser's location (not the business address). */
  readonly weatherHere = signal(false);
  /** The Today card header is showing the weather instead of "Today". */
  readonly weatherShown = signal(false);
  /** Real weather from the API (kept so the preview picker can go back to it). */
  private liveWeather: Weather | null = null;
  readonly wxPreview = signal<string>('');

  /** Weather preview (?wx=…): paint a sample sky, or go back to live weather. */
  setWxPreview(key: string) {
    this.wxPreview.set(key);
    const preview = WX_PREVIEW[key];
    if (preview) {
      this.weather.set({ place: 'Preview', ...preview });
      this.weatherShown.set(true);
    } else {
      this.weather.set(this.liveWeather);
    }
  }
  readonly busyRow = signal<string | null>(null);

  /** Rows marked done on this visit (hidden right away; the next load drops them for real). */
  private readonly doneKeys = signal<Set<string>>(new Set());

  /** Previous visit (ISO). Things after it are tagged New. */
  readonly lastVisit = signal<string | null>(null);

  private readonly tick = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly stopping = signal(false);

  // ── Access ───────────────────────────────────────────────────────────────

  can(area: PermissionArea): boolean {
    return !!areaLevel(this.session.me(), area);
  }

  readonly isAdmin = computed(() => {
    const me = this.session.me();
    return !!me && isAdminRole(me.role);
  });

  readonly showScope = computed(() => this.can('inbox') || areaLevel(this.session.me(), 'invoices') === 'all');

  // ── Header ───────────────────────────────────────────────────────────────

  readonly greeting = computed(() => {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    const first = this.session.me()?.firstName?.trim();
    return first ? `${part}, ${first}` : part;
  });

  readonly todayText = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  /** One-line summary under the greeting: only the parts that have something in them. */
  readonly summary = computed(() => {
    const parts: string[] = [];
    const overdue = this.todayOverdue().length;
    if (overdue) parts.push(`${overdue} overdue ${overdue === 1 ? 'item' : 'items'}`);
    const due = this.todayDue().length;
    if (due) parts.push(`${due} ${due === 1 ? 'thing' : 'things'} for today`);
    const drafts = this.draftInvoices().length;
    if (drafts) parts.push(`${drafts} ${drafts === 1 ? 'invoice' : 'invoices'} ready to send`);
    const unbilled = this.unbilled().data?.total ?? 0;
    if (unbilled > 0) parts.push(`${this.money(unbilled, 0)} of work not yet billed`);
    if (!parts.length) return 'Nothing urgent. A good day to get ahead.';
    const last = parts.pop()!;
    return `You have ${parts.length ? `${parts.join(', ')} and ${last}` : last}.`;
  });

  // ── Cards (drag to reorder) ──────────────────────────────────────────────

  private readonly savedOrder = signal<string[]>([]);

  readonly panels = computed(() => {
    const allowed = PANELS.filter((p) => p.visible(this));
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
      localStorage.setItem(this.key(ORDER_KEY), JSON.stringify(ids));
    } catch {
      // Order just won't be remembered.
    }
  }

  private loadOrder() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.key(ORDER_KEY)) ?? '[]');
      if (Array.isArray(parsed)) this.savedOrder.set(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      // Ignore bad stored data.
    }
  }

  private loadLastVisit() {
    try {
      const k = this.key(LAST_VISIT_KEY);
      this.lastVisit.set(localStorage.getItem(k));
      localStorage.setItem(k, new Date().toISOString());
    } catch {
      // No "New" tags then.
    }
  }

  private key(base: string): string {
    return `${base}:${this.session.me()?.id ?? 'anon'}`;
  }

  private isNew(iso: string | null | undefined): boolean {
    const last = this.lastVisit();
    return !!iso && !!last && iso > last;
  }

  // ── Financial health ─────────────────────────────────────────────────────

  readonly scopedInvoices = computed(() => {
    const all = this.invoices().data;
    const me = this.session.me()?.id;
    return this.mine() && me ? all.filter((i) => i.createdBy?.id === me) : all;
  });
  private readonly openInvoices = computed(() => this.scopedInvoices().filter((i) => i.status === 'SENT' && isUnpaidInvoiceStatus(i.status)));
  readonly outstandingTotal = computed(() => this.openInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly overdueInvoices = computed(() => this.openInvoices().filter((i) => invoiceDueFlag(i.dueDate, i.status) === 'overdue'));
  readonly overdueTotal = computed(() => this.overdueInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly draftInvoices = computed(() => this.scopedInvoices().filter((i) => i.status === 'DRAFT'));

  /** Money in from invoices paid in a date range. */
  private collected(from: Date, to: Date): number {
    return this.scopedInvoices()
      .filter((i) => i.paidAt && new Date(i.paidAt) >= from && new Date(i.paidAt) < to)
      .reduce((s, i) => s + Number(i.amountPaid ?? i.total ?? 0), 0);
  }

  readonly collectedThisMonth = computed(() => this.collected(monthStart(0), monthStart(1)));
  /** Last month up to the same day, so the comparison is fair early in the month. */
  readonly collectedLastMonthToDate = computed(() => {
    const start = monthStart(-1);
    const sameDay = new Date(start.getFullYear(), start.getMonth(), new Date().getDate() + 1);
    return this.collected(start, sameDay < monthStart(0) ? sameDay : monthStart(0));
  });
  readonly collectedDelta = computed(() => {
    const prev = this.collectedLastMonthToDate();
    if (!prev) return null;
    return Math.round(((this.collectedThisMonth() - prev) / prev) * 100);
  });

  readonly monthName = new Date().toLocaleDateString('en-US', { month: 'long' });

  /** Six months of invoiced (issued, not drafts or void) vs collected (paid). */
  readonly chartData = computed<ChartData>(() => {
    const labels: string[] = [];
    const invoiced: number[] = [];
    const collected: number[] = [];
    for (let k = -5; k <= 0; k++) {
      const from = monthStart(k);
      const to = monthStart(k + 1);
      labels.push(from.toLocaleDateString('en-US', { month: 'short' }));
      invoiced.push(
        this.scopedInvoices()
          .filter((i) => (i.status === 'SENT' || i.status === 'PAID') && new Date(i.issueDate) >= from && new Date(i.issueDate) < to)
          .reduce((s, i) => s + Number(i.total ?? 0), 0),
      );
      collected.push(this.collected(from, to));
    }
    return {
      labels,
      datasets: [
        { label: 'Invoiced', data: invoiced, backgroundColor: '#c4b5fd', borderRadius: 3, maxBarThickness: 16 },
        { label: 'Collected', data: collected, backgroundColor: '#6d28d9', borderRadius: 3, maxBarThickness: 16 },
      ],
    };
  });

  readonly chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10, font: { size: 12 } } },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${this.money(Number(c.raw), 0)}` } },
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true, ticks: { callback: (v) => this.compactMoney(Number(v)) }, grid: { color: '#f1f1f3' } },
    },
  };

  /** Money things to act on: drafts to send, overdue to chase, unbilled work to invoice. */
  readonly moneyActions = computed<DashRow[]>(() => {
    const rows: DashRow[] = [];
    for (const i of this.draftInvoices().slice(0, 3)) {
      rows.push({
        key: `draft:${i.id}`,
        title: `Draft ready · ${i.billToName || i.client?.name || i.displayNumber}`,
        subtitle: `${this.money(Number(i.total ?? 0))} · ${i.displayNumber}`,
        link: ['/invoices', i.id],
        icon: 'send',
        tone: 'info',
        action: { label: 'Review & send', link: ['/invoices', i.id], primary: true },
      });
    }
    for (const i of this.overdueInvoices().slice(0, 3)) {
      const days = i.dueDate ? daysBetween(i.dueDate) : 0;
      rows.push({
        key: `overdue:${i.id}`,
        title: `${days} ${days === 1 ? 'day' : 'days'} overdue · ${i.billToName || i.client?.name || i.displayNumber}`,
        subtitle: `${this.money(this.balance(i))} · ${i.displayNumber}`,
        link: ['/invoices', i.id],
        icon: 'circle-alert',
        tone: 'danger',
        action: { label: 'Open', link: ['/invoices', i.id] },
      });
    }
    for (const c of (this.unbilled().data?.clients ?? []).filter((c) => c.total > 0 || c.hours > 0).slice(0, 3)) {
      const since = c.since ? ` since ${new Date(c.since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '';
      rows.push({
        key: `unbilled:${c.clientId}`,
        title: `Unbilled · ${c.clientName}`,
        subtitle: `${this.money(c.total)} · ${this.hours(c.hours)}${since}${c.missingRateHours ? ' · some time has no rate' : ''}`,
        link: ['/accounts', c.clientId],
        icon: 'clock',
        tone: 'warning',
        action: { label: 'Invoice', link: '/invoices/new', query: { clientId: c.clientId } },
      });
    }
    return rows;
  });

  // ── Today ────────────────────────────────────────────────────────────────

  private readonly today = todayKey();

  private taskRow(t: MyTask): DashRow {
    return {
      key: `task:${t.id}`,
      title: t.name,
      subtitle: `Task${t.createdBy && t.createdBy.id !== this.session.me()?.id ? ` from ${personDisplayName(t.createdBy)}` : ''} · ${t.project.name}`,
      link: ['/tasks'],
      query: { task: t.id },
      icon: 'square-check-big',
      tone: 'info',
      badge: this.dueBadge(t.dueOn),
      done: async () => {
        await this.tm.updateTask(t.id, { isCompleted: true });
      },
    };
  }

  private nextStepRow(r: QueueRow): DashRow {
    const days = r.at ? daysBetween(r.at) : 0;
    return {
      key: `next:${r.refKey}`,
      title: r.title,
      subtitle: `Next step · ${r.clientName || 'Pipeline card'}${!this.mine() && r.owner ? ` · ${r.owner}` : ''}`,
      link: r.leadId ? ['/pipeline', r.leadId] : r.clientId ? ['/accounts', r.clientId] : null,
      icon: 'circle-arrow-right',
      tone: 'warning',
      badge: r.overdue
        ? { label: `${days}d`, severity: 'danger', hint: `Overdue by ${days} ${days === 1 ? 'day' : 'days'} (due ${this.longDate(r.at)})` }
        : { label: 'Today', severity: 'warn', hint: 'Due today' },
      done: r.clientId && !r.leadId ? async () => void (await this.comms.completeNextStep(r.clientId!)) : undefined,
    };
  }

  private readonly openTasks = computed(() => this.tasks().data.filter((t) => !t.isCompleted));
  private readonly nextStepRows = computed(() => this.queues().data?.nextStep ?? []);

  /** Next steps overdue more than STALE_DAYS: one cleanup line, not a wall of red. */
  readonly staleNextSteps = computed(() =>
    this.nextStepRows().filter((r) => r.overdue && r.at && daysBetween(r.at) > STALE_DAYS),
  );

  readonly todayOverdue = computed<DashRow[]>(() => {
    const done = this.doneKeys();
    const rows = [
      ...this.openTasks().filter((t) => t.dueOn && t.dueOn < this.today).map((t) => this.taskRow(t)),
      ...this.nextStepRows()
        .filter((r) => r.overdue && !(r.at && daysBetween(r.at) > STALE_DAYS))
        .map((r) => this.nextStepRow(r)),
    ];
    return rows.filter((r) => !done.has(r.key));
  });

  readonly todayDue = computed<DashRow[]>(() => {
    const done = this.doneKeys();
    const rows: DashRow[] = [];
    const now = Date.now();
    for (const b of this.bookings().data) {
      const t = new Date(b.startAt);
      if (b.status !== 'CONFIRMED' || dateKey(t) !== this.today || t.getTime() < now - 3_600_000) continue;
      rows.push({
        key: `booking:${b.id}`,
        title: `${b.bookingType?.name ?? 'Booking'} · ${b.guestOrg || b.guestName}`,
        subtitle: `Booking · ${t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${b.guestName}`,
        link: b.lead ? ['/pipeline', b.lead.id] : '/bookings',
        icon: 'calendar',
        tone: 'success',
      });
    }
    for (const s of this.myShifts().filter((s) => dateKey(new Date(s.startAt)) === this.today)) {
      rows.push({
        key: `shift:${s.id}`,
        title: s.clientName,
        subtitle: `Shift · ${this.shiftWhen(s)}`,
        link: ['/accounts', s.clientId],
        query: { tab: 'care' },
        icon: 'house',
        tone: 'success',
      });
    }
    rows.push(...this.openTasks().filter((t) => t.dueOn === this.today).map((t) => this.taskRow(t)));
    rows.push(...this.nextStepRows().filter((r) => !r.overdue && r.dueToday).map((r) => this.nextStepRow(r)));
    const subs = this.submissions().data;
    if (subs.length) {
      const first = subs[0];
      rows.push({
        key: 'submissions',
        title: `${first.submitterName ?? first.submitterEmail ?? 'Submission'} · ${first.formName}`,
        subtitle: subs.length > 1 ? `Submission to review · ${subs.length} waiting` : 'Submission to review',
        link: ['/forms/submissions', first.id],
        icon: 'clipboard-list',
        tone: 'warning',
        action: { label: 'Review', link: ['/forms/submissions', first.id] },
      });
    }
    const unfiled = this.queues().data?.counts.unfiled ?? 0;
    if (unfiled) {
      rows.push({
        key: 'unfiled',
        title: `${unfiled} ${unfiled === 1 ? 'email' : 'emails'} to file`,
        subtitle: 'Unfiled · senders not tied to an account',
        link: '/activity',
        query: { tab: 'todo', queue: 'unfiled' },
        icon: 'mail',
        tone: 'neutral',
        action: { label: 'File', link: '/activity', query: { tab: 'todo', queue: 'unfiled' } },
      });
    }
    return rows.filter((r) => !done.has(r.key));
  });

  readonly todayLoading = computed(() => this.tasks().loading || this.queues().loading);

  async markDone(row: DashRow) {
    if (!row.done || this.busyRow()) return;
    this.busyRow.set(row.key);
    try {
      await row.done();
      this.doneKeys.update((s) => new Set(s).add(row.key));
      this.toast.add({ severity: 'success', summary: 'Done', detail: row.title, life: 2500 });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not mark done', detail: errorText(err, 'Failed') });
    } finally {
      this.busyRow.set(null);
    }
  }

  // ── My work ──────────────────────────────────────────────────────────────

  private workRow(t: MyTask): DashRow {
    const me = this.session.me()?.id;
    const from = t.createdBy && t.createdBy.id !== me ? t.createdBy : null;
    const parts: string[] = [];
    if (from) parts.push(`From ${personDisplayName(from)}${t.createdAt ? ` · ${relativeTime(t.createdAt)}` : ''}`);
    else parts.push('You created');
    parts.push(t.project.name);
    if (t.subtaskCount) parts.push(`${t.completedSubtaskCount} of ${t.subtaskCount} subtasks`);
    if (t.commentCount) {
      const who = t.lastComment?.author && t.lastComment.author.id !== me ? personDisplayName(t.lastComment.author) : null;
      parts.push(
        `${t.commentCount} ${t.commentCount === 1 ? 'comment' : 'comments'}${who && t.lastComment ? `, last from ${who} ${relativeTime(t.lastComment.at)}` : ''}`,
      );
    }
    const commentIsNew = !!t.lastComment && t.lastComment.author?.id !== me && this.isNew(t.lastComment.at);
    return {
      key: `work:${t.id}`,
      title: t.name,
      subtitle: parts.join(' · '),
      link: ['/tasks'],
      query: { task: t.id },
      person: from ?? t.createdBy ?? t.assignee ?? null,
      badge: this.dueBadge(t.dueOn),
      isNew: (!!from && this.isNew(t.createdAt)) || commentIsNew,
    };
  }

  readonly workNew = computed(() => this.openTasks().map((t) => this.workRow(t)).filter((r) => r.isNew));
  readonly workDue = computed(() => {
    const horizon = addDaysKey(this.today, LOOKAHEAD_DAYS);
    const newKeys = new Set(this.workNew().map((r) => r.key));
    return this.openTasks()
      .filter((t) => t.dueOn && t.dueOn <= horizon)
      .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
      .map((t) => this.workRow(t))
      .filter((r) => !newKeys.has(r.key));
  });
  readonly workLater = computed(() => {
    const horizon = addDaysKey(this.today, LOOKAHEAD_DAYS);
    return this.openTasks().filter((t) => !t.dueOn || t.dueOn > horizon).length;
  });

  // ── Pipeline & relationships ─────────────────────────────────────────────

  /** The first pipeline (sales). Cards that track an invoice, project or client aren't opportunities. */
  readonly mainPipeline = computed(() => this.pipelines().data[0] ?? null);
  private readonly opportunities = computed(() =>
    this.leads().data.filter((l) => !l.invoiceId && !l.projectId && !l.trackedClientId),
  );
  readonly pipelineValue = computed(() => this.opportunities().reduce((s, l) => s + Number(l.estimatedValue ?? 0), 0));
  readonly pipelineValued = computed(() => this.opportunities().filter((l) => l.estimatedValue != null && Number(l.estimatedValue) > 0).length);
  readonly stageBars = computed(() => {
    const p = this.mainPipeline();
    if (!p) return [];
    const counts = new Map<string, { n: number; value: number }>();
    for (const l of this.opportunities()) {
      if (!l.stageId) continue;
      const c = counts.get(l.stageId) ?? { n: 0, value: 0 };
      c.n++;
      c.value += Number(l.estimatedValue ?? 0);
      counts.set(l.stageId, c);
    }
    const shades = ['#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af'];
    return [...p.stages]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((s, i) => ({ id: s.id, name: s.name, count: counts.get(s.id)?.n ?? 0, value: counts.get(s.id)?.value ?? 0, color: s.color && /^(#|rgb|hsl)/.test(s.color) ? s.color : shades[i % shades.length] }))
      .map((s, _i, all) => {
        const max = Math.max(1, ...all.map((x) => x.count));
        return { ...s, pct: s.count ? Math.max(4, Math.round((s.count / max) * 100)) : 0 };
      });
  });
  readonly openCount = computed(() => this.stageBars().reduce((s, b) => s + b.count, 0));

  readonly quietRows = computed<DashRow[]>(() =>
    (this.queues().data?.quiet ?? []).slice(0, 5).map((r) => {
      const days = r.at ? daysBetween(r.at) : null;
      return {
        key: `quiet:${r.refKey}`,
        title: r.clientName || r.title,
        subtitle: r.at ? `Last contact ${lastContactLabel(r.at)}` : 'No contact yet',
        link: r.clientId ? ['/accounts', r.clientId] : r.leadId ? ['/pipeline', r.leadId] : null,
        icon: 'building-2',
        badge: days != null ? { label: `${days} days`, severity: days > 30 ? 'danger' : 'warn', hint: `${days} days since anyone contacted them` } : undefined,
      } satisfies DashRow;
    }),
  );

  readonly upcomingNextSteps = computed<DashRow[]>(() => {
    const horizon = addDaysKey(this.today, LOOKAHEAD_DAYS);
    return this.nextStepRows()
      .filter((r) => !r.overdue && !r.dueToday && r.at && dateKey(new Date(r.at)) <= horizon)
      .slice(0, 4)
      .map((r) => ({
        key: `upnext:${r.refKey}`,
        title: r.title,
        subtitle: r.clientName || 'Pipeline card',
        link: r.leadId ? ['/pipeline', r.leadId] : r.clientId ? ['/accounts', r.clientId] : null,
        icon: 'circle-arrow-right',
        tone: 'neutral' as const,
        badge: { label: dueLabel(dateKey(new Date(r.at!))), severity: 'secondary' as const, hint: `Due ${this.longDate(r.at)}` },
      }));
  });

  // ── Since you were last here ─────────────────────────────────────────────

  readonly feed = computed<DashRow[]>(() => {
    const since = new Date(Date.now() - FEED_DAYS * 86_400_000).toISOString();
    const me = this.session.me()?.id;
    const rows: DashRow[] = [];
    for (const i of this.scopedInvoices()) {
      if (i.paidAt && i.paidAt >= since) {
        rows.push({
          key: `paid:${i.id}`,
          at: i.paidAt,
          title: `${i.billToName || i.client?.name || 'Invoice'} paid ${i.displayNumber}`,
          subtitle: `Payment · ${this.money(Number(i.amountPaid ?? i.total ?? 0))}`,
          link: ['/invoices', i.id],
          icon: 'circle-dollar-sign',
          tone: 'success',
        });
      }
    }
    for (const t of this.tasks().data) {
      const c = t.lastComment;
      if (c && c.at >= since && c.author && c.author.id !== me) {
        rows.push({
          key: `comment:${t.id}`,
          at: c.at,
          title: `${personDisplayName(c.author)} commented on "${t.name}"`,
          subtitle: `Comment · ${t.project.name}`,
          link: ['/tasks'],
          query: { task: t.id },
          person: c.author,
        });
      }
      if (t.createdBy && t.createdBy.id !== me && t.createdAt >= since) {
        rows.push({
          key: `assigned:${t.id}`,
          at: t.createdAt,
          title: `${personDisplayName(t.createdBy)} gave you "${t.name}"`,
          subtitle: `Task · ${t.project.name}`,
          link: ['/tasks'],
          query: { task: t.id },
          person: t.createdBy,
        });
      }
    }
    for (const b of this.bookings().data) {
      if (b.createdAt && b.createdAt >= since) {
        const when = new Date(b.startAt);
        rows.push({
          key: `booked:${b.id}`,
          at: b.createdAt,
          title: `${b.guestOrg || b.guestName} booked ${b.bookingType?.name ?? 'a meeting'}`,
          subtitle: `Booking · ${dueLabel(dateKey(when))} ${when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
          link: b.lead ? ['/pipeline', b.lead.id] : '/bookings',
          icon: 'calendar',
          tone: 'info',
        });
      }
    }
    for (const p of this.submissions().data) {
      if (p.createdAt >= since) {
        rows.push({
          key: `sub:${p.id}`,
          at: p.createdAt,
          title: `${p.submitterName ?? p.submitterEmail ?? 'Someone'} completed ${p.formName}`,
          subtitle: 'Form submission · waiting for review',
          link: ['/forms/submissions', p.id],
          icon: 'clipboard-list',
          tone: 'warning',
        });
      }
    }
    for (const m of this.queues().data?.unfiled ?? []) {
      if (m.occurredAt >= since) {
        rows.push({
          key: `mail:${m.id}`,
          at: m.occurredAt,
          title: m.subject || '(no subject)',
          subtitle: 'Email · not filed yet',
          link: '/activity',
          query: { tab: 'todo', queue: 'unfiled' },
          icon: 'mail',
          tone: 'neutral',
        });
      }
    }
    return rows
      .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
      .slice(0, 8)
      .map((r) => ({ ...r, isNew: this.isNew(r.at) }));
  });

  readonly feedSubtitle = computed(() => {
    const last = this.lastVisit();
    if (!last) return `Last ${FEED_DAYS} days`;
    const d = new Date(last);
    return `Last visit ${relativeTime(last)}${daysBetween(last) === 0 ? ` at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}`;
  });

  feedWhen(r: DashRow): string {
    return r.at ? relativeTime(r.at) : '';
  }

  // ── My time ──────────────────────────────────────────────────────────────

  readonly runningEntry = computed(() => this.time().data.find((e) => !e.stoppedAt) ?? null);
  readonly elapsedLabel = computed(() => {
    this.tick();
    const running = this.runningEntry();
    return running ? formatElapsed(Date.now() - new Date(running.startedAt).getTime()) : '';
  });

  private minutesOf(e: TimeEntry): number {
    return e.stoppedAt ? (e.durationMin ?? 0) : Math.max(0, Math.round((Date.now() - new Date(e.startedAt).getTime()) / 60_000));
  }

  private readonly weekEntries = computed(() => {
    this.tick();
    const weekStart = dateKey(startOfWeek(new Date()));
    return this.time().data.filter((e) => dateKey(new Date(e.startedAt)) >= weekStart);
  });
  readonly weekMinutes = computed(() => this.weekEntries().reduce((s, e) => s + this.minutesOf(e), 0));
  readonly weekLabel = computed(() => formatDurationMin(this.weekMinutes()));
  readonly billablePct = computed(() => {
    const total = this.weekMinutes();
    if (!total) return null;
    const billable = this.weekEntries().filter((e) => e.isBillable !== false).reduce((s, e) => s + this.minutesOf(e), 0);
    return Math.round((billable / total) * 100);
  });
  /** Hours per day, Monday through Sunday, as bar heights. */
  readonly weekDays = computed(() => {
    const start = startOfWeek(new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const key = dateKey(d);
      const min = this.weekEntries().filter((e) => dateKey(new Date(e.startedAt)) === key).reduce((s, e) => s + this.minutesOf(e), 0);
      return { key, label: d.toLocaleDateString('en-US', { weekday: 'narrow' }), min, isToday: key === this.today };
    });
    const max = Math.max(60, ...days.map((d) => d.min));
    return days.map((d) => ({
      ...d,
      pct: Math.max(4, Math.round((d.min / max) * 100)),
      title: `${new Date(`${d.key}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' })}: ${formatDurationMin(d.min)} hrs`,
    }));
  });

  // ── My shifts (Care) ─────────────────────────────────────────────────────

  readonly myShifts = computed(() => this.shifts().data.filter((s) => s.status === 'SCHEDULED' && new Date(s.endAt).getTime() >= Date.now()));

  canStartShift(s: CareShiftDto): boolean {
    return !s.visitId && dateKey(new Date(s.startAt)) === dateKey(new Date());
  }

  shiftWhen(s: CareShiftDto): string {
    const d = new Date(s.startAt);
    return `${dueLabel(dateKey(d))} ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  async startShift(s: CareShiftDto) {
    this.startingShift.set(s.id);
    try {
      const visit = await this.care.createVisit({ clientId: s.clientId, shiftId: s.id });
      await this.router.navigate(['/care/visits', visit.id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start visit', detail: errorText(err, 'Failed') });
    } finally {
      this.startingShift.set(null);
    }
  }

  // ── Weather ──────────────────────────────────────────────────────────────

  readonly weatherIcon = computed(() => {
    const w = this.weather();
    if (!w) return 'sun';
    const c = w.code;
    if (c === 0) return w.isDay ? 'sun' : 'moon';
    if (c <= 2) return w.isDay ? 'cloud-sun' : 'cloud-moon';
    if (c === 3) return 'cloud';
    if (c === 45 || c === 48) return 'cloud-fog';
    if (c >= 51 && c <= 57) return 'cloud-drizzle';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'cloud-rain';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'cloud-snow';
    if (c >= 95) return 'cloud-lightning';
    return 'cloud';
  });

  /** Which sky to paint behind the Today icon (see .dashboard-panel-sky in _dashboard.scss). */
  readonly weatherSky = computed<string | null>(() => {
    const w = this.weather();
    if (!w) return null;
    const c = w.code;
    if (c === 0) return w.isDay ? 'clear-day' : 'clear-night';
    if (c <= 2) return w.isDay ? 'partly-day' : 'partly-night';
    if (c === 3) return 'cloudy';
    if (c === 45 || c === 48) return 'fog';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if (c >= 95) return 'storm';
    if (c >= 51) return 'rain';
    return 'cloudy';
  });

  /** Partly cloudy: draw a sun or moon peeking behind a cloud (two icons, two colors). */
  readonly weatherPeek = computed(() => {
    const s = this.weatherSky();
    return s === 'partly-day' ? 'sun' : s === 'partly-night' ? 'moon' : null;
  });

  /** Sunny = warm, rain/snow = cool, night = muted. Severity tokens only. */
  readonly weatherTone = computed<DashboardPanelColor>(() => {
    const w = this.weather();
    if (!w) return 'neutral';
    if (!w.isDay) return 'neutral';
    if (w.code <= 2) return 'warning';
    if (w.code >= 51) return 'info';
    return 'neutral';
  });

  readonly precipWord = computed(() => {
    const c = this.weather()?.code ?? 0;
    return (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : 'rain';
  });

  readonly weatherHint = computed(() =>
    this.weatherHere()
      ? 'Weather where you are'
      : `Weather for your business address${this.weather()?.place ? ` (${this.weather()!.place})` : ''}. Click to use where you are.`,
  );

  /** No location prompt on load: use the browser's location only if this person already allowed it. */
  private async loadWeather(ask = false) {
    const wx = this.route.snapshot.queryParamMap.get('wx') ?? '';
    if (WX_PREVIEW[wx]) this.setWxPreview(wx);
    let coords: GeolocationCoordinates | null = null;
    try {
      const canAsk = ask || (await navigator.permissions?.query({ name: 'geolocation' as PermissionName }))?.state === 'granted';
      if (canAsk && navigator.geolocation) {
        coords = await new Promise<GeolocationCoordinates | null>((resolve) =>
          navigator.geolocation.getCurrentPosition((p) => resolve(p.coords), () => resolve(null), { maximumAge: 30 * 60_000, timeout: 8000 }),
        );
      }
    } catch {
      coords = null;
    }
    try {
      const q = coords ? `?lat=${coords.latitude.toFixed(3)}&lon=${coords.longitude.toFixed(3)}` : '';
      const data = await this.api.get<Weather | { unavailable: true }>(`/organization-profile/weather${q}`);
      if ('unavailable' in data) return;
      this.liveWeather = data;
      if (this.wxPreview()) return;
      this.weather.set(data);
      this.weatherHere.set(!!coords);
    } catch {
      // Weather is a nicety; leave it out.
    }
  }

  useMyLocation() {
    if (!this.weatherHere()) void this.loadWeather(true);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  constructor() {
    effect(() => {
      const mine = this.mine();
      untracked(() => {
        if (this.can('inbox')) void this.loadQueues(mine);
        if (this.can('invoices')) void this.loadUnbilled(mine);
      });
    });
  }

  ngOnInit() {
    this.loadOrder();
    this.loadLastVisit();
    this.timer = setInterval(() => this.tick.update((n) => n + 1), 30_000);
    if (!this.can('inbox')) this.queues.set({ loading: false, error: null, data: null });
    if (this.can('tasks')) void this.loadTasks();
    else this.tasks.set({ loading: false, error: null, data: [] });
    if (this.can('time')) void this.loadTime();
    if (this.can('invoices')) void this.loadInvoices();
    if (this.can('invoices') && this.isAdmin()) void this.loadPnl();
    else this.pnl.set({ loading: false, error: null, data: null });
    if (this.can('bookings')) void this.loadBookings();
    if (this.can('forms')) void this.loadSubmissions();
    if (this.can('schedule')) void this.loadShifts();
    if (this.can('pipeline')) void this.loadPipeline();
    void this.loadWeather();
  }

  ngOnDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

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

  private dueBadge(dueOn: string | null): DashRow['badge'] {
    if (!dueOn) return undefined;
    const tone = dueTone(dueOn);
    const due = this.longDate(`${dueOn}T00:00:00`);
    if (tone === 'overdue') {
      const d = daysBetween(`${dueOn}T00:00:00`);
      return { label: `Overdue ${d}d`, severity: 'danger', hint: `Was due ${due}, ${d} ${d === 1 ? 'day' : 'days'} ago` };
    }
    if (tone === 'today' || tone === 'soon') return { label: dueLabel(dueOn), severity: 'warn', hint: `Due ${due}` };
    return { label: dueLabel(dueOn), severity: 'secondary', hint: `Due ${due}` };
  }

  /** "Monday, November 9" (adds the year when it isn't this year). */
  longDate(iso: string | null | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  }

  /** Feed hover: full date and time. */
  feedWhenFull(r: DashRow): string {
    if (!r.at) return '';
    const d = new Date(r.at);
    return `${this.longDate(r.at)} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  money(n: number, digits = 2): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  }

  private compactMoney(n: number): string {
    return n >= 1000 ? `$${Math.round(n / 100) / 10}k` : `$${Math.round(n)}`;
  }

  hours(h: number): string {
    return `${Math.round(h * 10) / 10} hrs`;
  }

  panelColor(id: PanelId): DashboardPanelColor {
    return id === 'money' || id === 'time' || id === 'shifts' ? 'success' : id === 'today' ? 'warning' : id === 'feed' ? 'neutral' : 'info';
  }

  private balance(i: Invoice): number {
    return Math.max(0, Number(i.total ?? 0) - Number(i.amountPaid ?? 0));
  }

  // ── Loading ──────────────────────────────────────────────────────────────

  private async loadQueues(mine: boolean) {
    this.queues.update((s) => ({ ...s, loading: true, error: null }));
    try {
      this.queues.set({ loading: false, error: null, data: await this.comms.queues({ mine }) });
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

  private async loadUnbilled(mine: boolean) {
    try {
      this.unbilled.set({ loading: false, error: null, data: await this.api.get<Unbilled>(`/invoices/unbilled-summary?mine=${mine}`) });
    } catch (err) {
      this.unbilled.set({ loading: false, error: errorText(err, 'Could not load unbilled work'), data: null });
    }
  }

  /** Net this month from the books (admins only; the accounting reports are admin-only). */
  private async loadPnl() {
    try {
      const from = monthStart(0).toISOString();
      const to = new Date().toISOString();
      const data = await this.api.get<ProfitLoss>(`/accounting/reports/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      this.pnl.set({ loading: false, error: null, data });
    } catch {
      this.pnl.set({ loading: false, error: null, data: null });
    }
  }

  private async loadPipeline() {
    try {
      const list = await this.pipelinesApi.list();
      this.pipelines.set({ loading: false, error: null, data: list });
      const first = list[0];
      const leads = first ? await this.api.get<Lead[]>(`/leads?pipelineId=${first.id}`) : [];
      this.leads.set({ loading: false, error: null, data: leads });
    } catch (err) {
      this.pipelines.set({ loading: false, error: errorText(err, 'Could not load pipeline'), data: [] });
      this.leads.set({ loading: false, error: null, data: [] });
    }
  }

  private async loadSubmissions() {
    try {
      this.submissions.set({ loading: false, error: null, data: await this.formsApi.pending() });
    } catch (err) {
      this.submissions.set({ loading: false, error: errorText(err, 'Could not load submissions'), data: [] });
    }
  }

  private async loadShifts() {
    try {
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = addDays(from, LOOKAHEAD_DAYS);
      const data = await this.care.shifts({ from: from.toISOString(), to: to.toISOString(), userId: this.session.me()?.id ?? null });
      this.shifts.set({ loading: false, error: null, data });
    } catch (err) {
      this.shifts.set({ loading: false, error: errorText(err, 'Could not load shifts'), data: [] });
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
