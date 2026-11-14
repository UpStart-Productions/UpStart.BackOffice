import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { ChartData, ChartOptions } from 'chart.js';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TooltipModule } from 'primeng/tooltip';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';
import {
  areaLevel,
  HELP_AGENT_NAME,
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
import { HelpSidePanelService } from '../../core/help-side-panel.service';
import { JdThreadsService } from '../../core/jd-threads.service';
import { SessionService } from '../../core/session.service';
import { lastContactLabel } from '../../core/staleness.util';
import { TmApiService } from '../../task-manager/core/tm-api.service';
import { addDaysKey, dueLabel, dueTone, personDisplayName, todayKey } from '../../task-manager/core/tm-format.util';
import { MyTask, Person } from '../../task-manager/core/tm.types';
import { ReportChartComponent } from '../../ui/charts/report-chart.component';
import { DashboardPanelComponent, DashboardPanelColor } from '../../ui/dashboard-panel/dashboard-panel.component';
import { PageComponent } from '../../ui/layout/page.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { RecordCardComponent, RecordCardTone } from '../../ui/record-card/record-card.component';
import { invoiceDueFlag, isUnpaidInvoiceStatus } from '../invoices/invoice-status.util';
import type { TimeEntry } from '../time-entry/time-entry.types';
import { addDays, dateKey, endOfWeek, formatDurationMin, formatElapsed, startOfWeek } from '../time-entry/timesheet.utils';

/** Tasks, next steps and bookings this many days ahead count as coming up. */
const LOOKAHEAD_DAYS = 7;
/** Next steps overdue longer than this collapse into one "clean up" line instead of shouting in red. */
const STALE_DAYS = 30;
/** Today and My work show at most this many overdue rows, then an "and N more" line. */
const OVERDUE_SHOWN = 3;
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

type UnbilledLine = {
  id: string;
  date: string;
  person: string;
  description: string;
  hours: number;
  rate: number | null;
  rateSource: 'entry' | 'project' | 'person' | null;
  amount: number;
  beforeLastInvoice: boolean;
};

type UnbilledDetail = {
  clientId: string;
  clientName: string;
  lastInvoice: { id: string; displayNumber: string; issueDate: string; status: string } | null;
  hours: number;
  timeAmount: number;
  expenseAmount: number;
  total: number;
  projects: {
    projectId: string | null;
    name: string;
    projectBillable: boolean | null;
    hours: number;
    amount: number;
    missingRateHours: number;
    beforeLastInvoiceHours: number;
    lines: UnbilledLine[];
  }[];
  expenses: { id: string; date: string; project: string; projectBillable: boolean | null; description: string; amount: number; beforeLastInvoice: boolean }[];
  /** What the rules leave out (shown as a note). */
  excluded?: { beforeLastInvoiceHours: number; noProjectHours: number; notBillableProjectHours: number; expensesBeforeLastInvoice: number };
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
  /** Title opens something on this page (a breakdown popup) instead of navigating. */
  open?: () => void;
  isNew?: boolean;
  at?: string;
};

type PanelId = 'money' | 'jd' | 'today' | 'work' | 'pipeline' | 'feed' | 'time' | 'shifts';
/** Card width: full row, half a row, or a third of a row. */
export type PanelSize = 'full' | 'twoThirds' | 'half' | 'third';
type Panel = { id: PanelId; size: PanelSize; visible: (d: DashboardPage) => boolean };

/** Default order and widths. The grid back-fills gaps so rows stay full after a drag. */
const PANELS: Panel[] = [
  { id: 'money', size: 'twoThirds', visible: (d) => d.can('invoices') },
  { id: 'jd', size: 'third', visible: (d) => d.guideReady() && (d.can('inbox') || d.can('invoices')) },
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

/** Financial health date range. Figures, chart and unbilled work all use it. */
export type FinRange = 'month' | '3m' | '6m' | 'ytd' | '12m';
const FIN_RANGE_KEY = 'ubo-dashboard-fin-range:v1';
/** Mine / Everyone's and the Today weather toggle, per person, per browser. */
const SCOPE_KEY = 'ubo-dashboard-mine:v1';
const WEATHER_OPEN_KEY = 'ubo-dashboard-weather-open:v1';

/** Cards turned off in Customize, per person, per browser. */
const HIDDEN_KEY = 'ubo-dashboard-hidden:v1';

/** JD suggests: snoozed suggestions (key → until) and how often each kind was dismissed. */
const SUGGEST_SNOOZE_KEY = 'ubo-dashboard-suggest-snooze:v1';
const SUGGEST_COUNTS_KEY = 'ubo-dashboard-suggest-dismissed:v1';

type SuggestionKind = 'quiet' | 'overdue' | 'draft' | 'unbilled' | 'combo';
type Suggestion = {
  key: string;
  kind: SuggestionKind;
  accountId: string | null;
  accountName: string;
  text: string;
  score: number;
  action: {
    label: string;
    jd?: { recordType: string; recordId: string; title: string; prompt: string };
    link?: unknown[] | string;
    query?: Record<string, string>;
  };
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

/** A theme color for Chart.js (canvas can't read CSS variables itself). */
function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
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
    SelectModule,
    TagModule,
    TableModule,
    ToggleSwitchModule,
    AppDialogModule,
    TooltipModule,
    LucideIconComponent,
    DashboardPanelComponent,
    PageComponent,
    RecordCardComponent,
    ReportChartComponent,
    EmptyStateComponent,
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
  private readonly helpPanel = inject(HelpSidePanelService);
  private readonly jdThreads = inject(JdThreadsService);

  /** Cards the person turned off in Customize. */
  readonly hiddenPanels = signal<Set<string>>(new Set());

  // ── Customize ────────────────────────────────────────────────────────────

  readonly customizeOpen = signal(false);

  /** Every card this person's role can use, in their order, with whether it's showing. */
  readonly customizeRows = computed(() => {
    const hidden = this.hiddenPanels();
    const shown = this.panels().map((p) => p.id as string);
    const available = PANELS.filter((p) => p.visible(this));
    const ordered = [...available].sort((a, b) => {
      const ai = shown.indexOf(a.id);
      const bi = shown.indexOf(b.id);
      return (ai < 0 ? 99 + PANELS.indexOf(a) : ai) - (bi < 0 ? 99 + PANELS.indexOf(b) : bi);
    });
    return ordered.map((p) => ({ id: p.id, label: this.panelLabel(p.id), shown: !hidden.has(p.id) }));
  });

  panelLabel(id: PanelId): string {
    switch (id) {
      case 'money':
        return 'Financial health';
      case 'jd':
        return `${this.agentName} suggests`;
      case 'today':
        return 'Today';
      case 'work':
        return 'My work';
      case 'pipeline':
        return 'Pipeline & relationships';
      case 'feed':
        return 'Since last time';
      case 'time':
        return 'My time';
      case 'shifts':
        return 'My shifts';
    }
  }

  setPanelShown(id: string, shown: boolean) {
    this.hiddenPanels.update((s) => {
      const next = new Set(s);
      if (shown) next.delete(id);
      else next.add(id);
      return next;
    });
    this.saveHidden();
  }

  /** Every card back on, in the default order. */
  resetLayout() {
    this.hiddenPanels.set(new Set());
    this.savedOrder.set([]);
    try {
      localStorage.removeItem(this.key(ORDER_KEY));
    } catch {
      /* ignore */
    }
    this.saveHidden();
  }

  private saveHidden() {
    try {
      localStorage.setItem(this.key(HIDDEN_KEY), JSON.stringify([...this.hiddenPanels()]));
    } catch {
      // Not remembered.
    }
  }

  private loadHidden() {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.key(HIDDEN_KEY)) ?? '[]');
      if (Array.isArray(parsed)) this.hiddenPanels.set(new Set(parsed.filter((x): x is string => typeof x === 'string')));
    } catch {
      // Show everything.
    }
  }

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
    const allowed = PANELS.filter((p) => p.visible(this) && !this.hiddenPanels().has(p.id));
    const saved = this.savedOrder().filter((id) => allowed.some((p) => p.id === id));
    // Saved order first; a card the person hasn't placed yet (e.g. a new one) goes in at its default spot.
    const order = [...saved];
    for (const p of allowed) {
      if (order.includes(p.id)) continue;
      const defaultIndex = PANELS.findIndex((x) => x.id === p.id);
      const before = PANELS.slice(defaultIndex + 1).find((x) => order.includes(x.id));
      const at = before ? order.indexOf(before.id) : order.length;
      order.splice(at, 0, p.id);
    }
    return order.map((id) => allowed.find((p) => p.id === id)!);
  });

  /**
   * Smart widths on a six-column grid. Each card has a natural width (full 6, two-thirds 4, half 3, third 2).
   * Cards go into rows in the person's order; when the next one doesn't fit, the row closes and its
   * last card stretches to fill what's left. So two thirds side by side make a third and a two-thirds,
   * and a third beside a half makes a third and a two-thirds. No gaps, wherever a card is dragged.
   */
  readonly layout = computed(() => {
    const cols: Record<PanelSize, number> = { full: 6, twoThirds: 4, half: 3, third: 2 };
    const out: { panel: Panel; span: number; row: number; tall: boolean }[] = [];
    let used = 0;
    let row = 0;
    const closeRow = () => {
      if (out.length && used > 0 && used < 6) out[out.length - 1].span += 6 - used;
      if (used > 0) row++;
      used = 0;
    };
    for (const panel of this.panels()) {
      const need = cols[panel.size];
      if (used + need > 6) closeRow();
      out.push({ panel, span: need, row, tall: false });
      used += need;
      if (used === 6) closeRow();
    }
    closeRow();
    // Financial health sizes to its content; cards sharing its row stretch to match instead of the fixed height.
    const tallRows = new Set(out.filter((l) => l.panel.id === 'money').map((l) => l.row));
    return out.map((l) => ({ ...l, tall: tallRows.has(l.row) }));
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
  // Date range (saved per person, per browser).
  readonly finRangeOptions: { label: string; value: FinRange }[] = [
    { label: 'This month', value: 'month' },
    { label: 'Last 3 months', value: '3m' },
    { label: 'Last 6 months', value: '6m' },
    { label: 'Year to date', value: 'ytd' },
    { label: 'Last 12 months', value: '12m' },
  ];
  readonly finRange = signal<FinRange>('6m');

  setFinRange(r: FinRange) {
    this.finRange.set(r);
  }

  /** Start of the range through now, and the same length just before it (for comparisons). */
  readonly finBounds = computed(() => {
    const now = new Date();
    const r = this.finRange();
    const from =
      r === 'month' ? monthStart(0) : r === '3m' ? monthStart(-2) : r === '6m' ? monthStart(-5) : r === '12m' ? monthStart(-11) : new Date(now.getFullYear(), 0, 1);
    const prevFrom = new Date(from.getTime() - (now.getTime() - from.getTime()));
    const label = this.finRangeOptions.find((o) => o.value === r)?.label ?? '';
    return { from, to: now, prevFrom, label };
  });

  private inRange(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    const { from, to } = this.finBounds();
    return t >= from.getTime() && t <= to.getTime();
  }

  /** Sent and unpaid, issued in the range. */
  private readonly openInvoices = computed(() =>
    this.scopedInvoices().filter((i) => i.status === 'SENT' && isUnpaidInvoiceStatus(i.status) && this.inRange(i.issueDate)),
  );
  readonly outstandingTotal = computed(() => this.openInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly overdueInvoices = computed(() => this.openInvoices().filter((i) => invoiceDueFlag(i.dueDate, i.status) === 'overdue'));
  readonly overdueTotal = computed(() => this.overdueInvoices().reduce((sum, i) => sum + this.balance(i), 0));
  readonly draftInvoices = computed(() => this.scopedInvoices().filter((i) => i.status === 'DRAFT' && this.inRange(i.issueDate)));

  /** Money in from invoices paid in a date range. */
  private paidIn(from: Date, to: Date) {
    return this.scopedInvoices().filter((i) => i.paidAt && new Date(i.paidAt) >= from && new Date(i.paidAt) < to);
  }

  private collected(from: Date, to: Date): number {
    return this.paidIn(from, to).reduce((s, i) => s + Number(i.amountPaid ?? i.total ?? 0), 0);
  }

  readonly collectedInRange = computed(() => {
    const { from, to } = this.finBounds();
    return this.collected(from, new Date(to.getTime() + 1));
  });
  readonly paidCount = computed(() => {
    const { from, to } = this.finBounds();
    return this.paidIn(from, new Date(to.getTime() + 1)).length;
  });
  /** Compared with the same length of time just before the range. */
  readonly collectedDelta = computed(() => {
    const { from, prevFrom } = this.finBounds();
    const prev = this.collected(prevFrom, from);
    if (!prev) return null;
    return Math.round(((this.collectedInRange() - prev) / prev) * 100);
  });

  /** Invoiced (issued, not drafts or void) vs collected (paid): by week for a month or less, else by month. */
  readonly chartData = computed<ChartData>(() => {
    const { from, to } = this.finBounds();
    const buckets: { label: string; from: Date; to: Date }[] = [];
    if (this.finRange() === 'month') {
      let start = new Date(from);
      while (start <= to) {
        const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
        buckets.push({ label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), from: start, to: end });
        start = end;
      }
    } else {
      let start = new Date(from.getFullYear(), from.getMonth(), 1);
      while (start <= to) {
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const multiYear = from.getFullYear() !== to.getFullYear();
        buckets.push({
          label: start.toLocaleDateString('en-US', { month: 'short', year: multiYear ? '2-digit' : undefined }),
          from: start,
          to: end,
        });
        start = end;
      }
    }
    const invoiced = buckets.map((b) =>
      this.scopedInvoices()
        .filter((i) => (i.status === 'SENT' || i.status === 'PAID') && new Date(i.issueDate) >= b.from && new Date(i.issueDate) < b.to)
        .reduce((s, i) => s + Number(i.total ?? 0), 0),
    );
    const collected = buckets.map((b) => this.collected(b.from, b.to));
    return {
      labels: buckets.map((b) => b.label),
      datasets: [
        { label: 'Invoiced', data: invoiced, backgroundColor: cssVar('--p-primary-300', '#c4b5fd'), borderRadius: 3, maxBarThickness: 22 },
        { label: 'Collected', data: collected, backgroundColor: cssVar('--color-severity-success-text', '#16a34a'), borderRadius: 3, maxBarThickness: 22 },
      ],
    };
  });

  readonly chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${this.money(Number(c.raw), 0)}` } },
    },
    scales: {
      x: { grid: { display: false } },
      // Two labels only: the middle and the top (no $0).
      y: {
        beginAtZero: true,
        ticks: { callback: (v) => this.compactMoney(Number(v)) },
        afterBuildTicks: (axis) => {
          const max = axis.max;
          axis.ticks = max > 0 ? [{ value: max / 2 }, { value: max }] : [];
        },
        grid: { color: '#f1f1f3' },
      },
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
        open: () => void this.openUnbilled(c.clientId, c.clientName),
        icon: 'clock',
        tone: 'warning',
        action: { label: 'Invoice', link: '/invoices/new', query: this.unbilledInvoiceQuery(c.clientId, c.since) },
      });
    }
    return rows;
  });

  // ── Unbilled breakdown popup ─────────────────────────────────────────────

  readonly unbilledOpen = signal(false);
  readonly unbilledTitle = signal('');
  readonly unbilledDetail = signal<Section<UnbilledDetail | null>>({ loading: false, error: null, data: null });

  async openUnbilled(clientId: string, name: string) {
    this.unbilledTitle.set(name);
    this.unbilledDetail.set({ loading: true, error: null, data: null });
    this.unbilledOpen.set(true);
    try {
      const { from, to } = this.finBounds();
      const data = await this.api.get<UnbilledDetail>(
        `/invoices/unbilled-detail?clientId=${encodeURIComponent(clientId)}&mine=${this.mine()}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`,
      );
      this.unbilledDetail.set({ loading: false, error: null, data });
    } catch (err) {
      this.unbilledDetail.set({ loading: false, error: errorText(err, 'Could not load the breakdown'), data: null });
    }
  }

  /** New invoice for a client with all its unbilled lines already on it (from the earliest one through today). */
  unbilledInvoiceQuery(clientId: string, since: string | null | undefined): Record<string, string> {
    const q: Record<string, string> = { clientId, unbilled: '1' };
    if (since) q['from'] = dateKey(new Date(since));
    return q;
  }

  /** Earliest line in the breakdown popup (time or expense). */
  unbilledSince(d: UnbilledDetail): string | null {
    const dates = [...d.projects.flatMap((g) => g.lines.map((l) => l.date)), ...d.expenses.map((x) => x.date)].sort();
    return dates[0] ?? null;
  }

  /** "Not counted: 41 hrs before the last invoice · 3 hrs with no project" (empty when nothing was left out). */
  excludedNote(d: UnbilledDetail): string {
    const x = d.excluded;
    if (!x) return '';
    const parts: string[] = [];
    if (x.beforeLastInvoiceHours) parts.push(`${this.hours(x.beforeLastInvoiceHours)} on or before the last invoice`);
    if (x.noProjectHours) parts.push(`${this.hours(x.noProjectHours)} with no project`);
    if (x.notBillableProjectHours) parts.push(`${this.hours(x.notBillableProjectHours)} on non-billable projects`);
    if (x.expensesBeforeLastInvoice) parts.push(`${x.expensesBeforeLastInvoice} ${x.expensesBeforeLastInvoice === 1 ? 'expense' : 'expenses'} before the last invoice`);
    return parts.length ? `Not counted: ${parts.join(' · ')}.` : '';
  }

  rateLabel(l: UnbilledLine): string {
    if (l.rate == null) return 'No rate';
    const src = l.rateSource === 'entry' ? 'entry' : l.rateSource === 'project' ? 'project' : l.rateSource === 'person' ? 'person' : '';
    return `${this.money(l.rate, 0)}${src ? ` (${src})` : ''}`;
  }

  rateHint(l: UnbilledLine): string {
    switch (l.rateSource) {
      case 'entry':
        return 'Rate set on this time entry';
      case 'project':
        return "The project's hourly rate";
      case 'person':
        return "No entry or project rate, so this uses the person's own hourly rate";
      default:
        return 'No rate on the entry, project or person: not counted in the amount';
    }
  }

  shortDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }

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

  private readonly openTasks = computed(() => {
    const done = this.doneKeys();
    return this.tasks().data.filter((t) => !t.isCompleted && !done.has(`task:${t.id}`));
  });
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

  readonly todayOverdueShown = computed(() => this.todayOverdue().slice(0, OVERDUE_SHOWN));
  /** Overdue rows past the first three, split so the "more" line can link to each list. */
  readonly todayOverdueMore = computed(() => {
    const rest = this.todayOverdue().slice(OVERDUE_SHOWN);
    return { total: rest.length, tasks: rest.filter((r) => r.key.startsWith('task:')).length, nextSteps: rest.filter((r) => r.key.startsWith('next:')).length };
  });

  readonly todayLoading = computed(() => this.tasks().loading || this.queues().loading);
  /** A brand-new workspace (no tasks, invoices, pipeline cards or next steps yet): list panels show ghosted empty states. */
  readonly firstRun = computed(() => {
    const t = this.tasks(), inv = this.invoices(), l = this.leads(), q = this.queues();
    if (t.loading || inv.loading || l.loading || q.loading) return false;
    return !t.data.length && !inv.data.length && !l.data.length && !this.nextStepRows().length;
  });

  async markDone(row: DashRow) {
    if (!row.done || this.busyRow()) return;
    this.busyRow.set(row.key);
    try {
      await row.done();
      // A task shows in Today and My work: hide it in both.
      const id = row.key.replace(/^(task|work):/, '');
      this.doneKeys.update((s) => {
        const next = new Set(s).add(row.key);
        if (id !== row.key) next.add(`task:${id}`).add(`work:${id}`);
        return next;
      });
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
      done: async () => {
        await this.tm.updateTask(t.id, { isCompleted: true });
      },
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

  /** Overdue first, oldest first; only the first three show. */
  private readonly workOverdueAll = computed(() =>
    this.openTasks()
      .filter((t) => t.dueOn && t.dueOn < this.today)
      .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''))
      .map((t) => this.workRow(t)),
  );
  readonly workOverdue = computed(() => this.workOverdueAll().slice(0, OVERDUE_SHOWN));
  readonly workOverdueMore = computed(() => Math.max(0, this.workOverdueAll().length - OVERDUE_SHOWN));
  readonly workNew = computed(() => {
    const overdue = new Set(this.workOverdueAll().map((r) => r.key));
    return this.openTasks().map((t) => this.workRow(t)).filter((r) => r.isNew && !overdue.has(r.key));
  });
  /** Due today through the next week (overdue has its own group above). */
  readonly workDue = computed(() => {
    const horizon = addDaysKey(this.today, LOOKAHEAD_DAYS);
    const newKeys = new Set(this.workNew().map((r) => r.key));
    return this.openTasks()
      .filter((t) => t.dueOn && t.dueOn >= this.today && t.dueOn <= horizon)
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
  /** This week's hours by project (client, or "No project"), biggest first, top four. */
  readonly weekByProject = computed(() => {
    const groups = new Map<string, { key: string; name: string; min: number; billable: boolean; link: unknown[] | null }>();
    for (const e of this.weekEntries()) {
      const key = e.project?.id ?? (e.client ? `client:${e.client.id}` : 'none');
      const g = groups.get(key) ?? {
        key,
        name: e.project?.name ?? e.client?.name ?? 'No project',
        min: 0,
        billable: e.isBillable !== false,
        link: e.project ? ['/projects', e.project.id] : e.client ? ['/accounts', e.client.id] : null,
      };
      g.min += this.minutesOf(e);
      groups.set(key, g);
    }
    const list = [...groups.values()].sort((a, b) => b.min - a.min);
    const max = Math.max(1, ...list.map((g) => g.min));
    return {
      top: list.slice(0, 4).map((g) => ({ ...g, label: `${formatDurationMin(g.min)} hrs`, pct: Math.max(4, Math.round((g.min / max) * 100)) })),
      more: Math.max(0, list.length - 4),
    };
  });

  /** Hours per day, Monday through Sunday, as bar heights. */
  readonly weekDayLabels = computed(() => this.weekDays().map((d) => d.label));
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

  // ── JD suggests ──────────────────────────────────────────────────────────
  //
  // Plain checks over data the page already has (no AI to decide what to suggest): accounts gone quiet,
  // unbilled work, invoice drafts sitting, overdue invoices. Scored by money and days; one account with
  // two problems becomes one combined suggestion. "Not now" hides one for 3 days; dismissing a kind
  // three times pushes that kind down. Clicking the main button opens JD on that account's conversation
  // with the request already sent, or goes straight to the invoice when that's quicker.

  readonly guideReady = computed(() => this.helpPanel.guideConfigured());
  /** The guide's display name (shared constant; never hard-code it). */
  readonly agentName = HELP_AGENT_NAME;
  private readonly snoozes = signal<Record<string, number>>({});
  private readonly dismissCounts = signal<Record<string, number>>({});

  readonly suggestions = computed<Suggestion[]>(() => {
    const now = Date.now();
    const snoozed = this.snoozes();
    const counts = this.dismissCounts();
    const out: Suggestion[] = [];
    const byAccount = new Map<string, Suggestion[]>();
    const add = (s: Suggestion) => {
      if ((snoozed[s.key] ?? 0) > now) return;
      s.score -= (counts[s.kind] ?? 0) >= 3 ? 40 : 0;
      out.push(s);
      if (s.accountId) byAccount.set(s.accountId, [...(byAccount.get(s.accountId) ?? []), s]);
    };

    if (this.can('inbox')) {
      for (const r of (this.queues().data?.quiet ?? []).slice(0, 8)) {
        if (!r.clientId) continue;
        const days = r.at ? daysBetween(r.at) : null;
        const name = r.clientName || r.title;
        add({
          key: `quiet:${r.clientId}`,
          kind: 'quiet',
          accountId: r.clientId,
          accountName: name,
          text: days != null ? `${name} hasn't heard from you in ${days} days. Want a quick check-in?` : `You haven't been in touch with ${name} yet. Want to reach out?`,
          score: 20 + Math.min(days ?? 30, 90) / 3,
          action: {
            label: 'Draft it',
            jd: {
              recordType: 'account',
              recordId: r.clientId,
              title: `Check in with ${name}`,
              prompt: `Draft a short, friendly check-in email to ${name}. ${days != null ? `It's been ${days} days since we were last in touch. ` : ''}Look at our recent activity and any open items with them first, and keep it under 120 words.`,
            },
          },
        });
      }
    }

    if (this.can('invoices')) {
      for (const i of this.overdueInvoices().slice(0, 5)) {
        const days = i.dueDate ? daysBetween(i.dueDate) : 0;
        const name = i.billToName || i.client?.name || 'the client';
        const amount = this.money(this.balance(i), 0);
        add({
          key: `overdue:${i.id}`,
          kind: 'overdue',
          accountId: i.client?.id ?? null,
          accountName: name,
          text: `${name} is ${days} ${days === 1 ? 'day' : 'days'} past due on ${i.displayNumber} (${amount}). Want a friendly reminder?`,
          score: 40 + Math.min(this.balance(i) / 100, 40) + Math.min(days, 30),
          action: {
            label: 'Draft reminder',
            jd: {
              recordType: i.client ? 'account' : 'invoice',
              recordId: i.client?.id ?? i.id,
              title: `Reminder: ${i.displayNumber}`,
              prompt: `Draft a friendly payment reminder to ${name} for invoice ${i.displayNumber}: ${amount}, due ${i.dueDate ? this.shortDate(i.dueDate) : 'recently'} (${days} days ago). Keep it warm and short, and include the amount and invoice number.`,
            },
          },
        });
      }
      for (const i of this.draftInvoices()) {
        const age = daysBetween(i.issueDate);
        if (age < 2) continue;
        const name = i.billToName || i.client?.name || 'a client';
        add({
          key: `draft:${i.id}`,
          kind: 'draft',
          accountId: i.client?.id ?? null,
          accountName: name,
          text: `${i.displayNumber} for ${name} (${this.money(Number(i.total ?? 0), 0)}) has been a draft for ${age} days. Ready to send it?`,
          score: 30 + Math.min(Number(i.total ?? 0) / 100, 40),
          action: { label: 'Review & send', link: ['/invoices', i.id] },
        });
      }
      for (const c of (this.unbilled().data?.clients ?? []).filter((x) => x.total >= 100).slice(0, 5)) {
        add({
          key: `unbilled:${c.clientId}`,
          kind: 'unbilled',
          accountId: c.clientId,
          accountName: c.clientName,
          text: `${c.clientName} has ${this.money(c.total, 0)} of work you haven't billed yet (${this.hours(c.hours)}). Want to invoice it?`,
          score: 35 + Math.min(c.total / 100, 50),
          action: { label: 'Create invoice', link: '/invoices/new', query: this.unbilledInvoiceQuery(c.clientId, c.since) },
        });
      }
    }

    // One account, two problems (gone quiet plus money waiting): one suggestion that handles both.
    for (const [accountId, list] of byAccount) {
      const quiet = list.find((s) => s.kind === 'quiet');
      const money = list.find((s) => s.kind === 'draft' || s.kind === 'unbilled' || s.kind === 'overdue');
      if (!quiet || !money) continue;
      const name = quiet.accountName;
      const combined: Suggestion = {
        key: `combo:${accountId}`,
        kind: 'combo',
        accountId,
        accountName: name,
        text:
          money.kind === 'overdue'
            ? `${name} has gone quiet and has an overdue invoice. Want one note that checks in and nudges the payment?`
            : money.kind === 'draft'
              ? `${name} has gone quiet, and their invoice is sitting in drafts. Send it with a short check-in?`
              : `${name} has gone quiet, and there's unbilled work for them. Invoice it and check in at the same time?`,
        score: quiet.score + money.score + 15,
        action: {
          label: 'Draft it',
          jd: {
            recordType: 'account',
            recordId: accountId,
            title: `Check in with ${name}`,
            prompt: `${name} has gone quiet, and ${money.kind === 'overdue' ? 'they have an overdue invoice' : money.kind === 'draft' ? 'their invoice is still a draft' : 'there is unbilled work for them'}. Look at our recent activity and their invoices, then draft one short, friendly email that checks in and ${money.kind === 'overdue' ? 'gently reminds them about the payment' : 'lets them know the invoice is on its way'}.`,
          },
        },
      };
      if ((snoozed[combined.key] ?? 0) > now) continue;
      for (const s of [quiet, money]) out.splice(out.indexOf(s), 1);
      out.push(combined);
    }

    return out.sort((a, b) => b.score - a.score).slice(0, 3);
  });

  runSuggestion(s: Suggestion) {
    if (s.action.jd) {
      this.jdThreads.openFor(s.action.jd);
    } else if (s.action.link) {
      void this.router.navigate(Array.isArray(s.action.link) ? s.action.link : [s.action.link], { queryParams: s.action.query ?? {} });
    }
  }

  /** Hide for 3 days. Three dismissals of one kind push that kind down the list. */
  notNow(s: Suggestion) {
    const until = Date.now() + 3 * 86_400_000;
    this.snoozes.update((m) => ({ ...m, [s.key]: until }));
    this.dismissCounts.update((m) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }));
    try {
      localStorage.setItem(this.key(SUGGEST_SNOOZE_KEY), JSON.stringify(this.snoozes()));
      localStorage.setItem(this.key(SUGGEST_COUNTS_KEY), JSON.stringify(this.dismissCounts()));
    } catch {
      // Not remembered.
    }
  }

  private loadSuggestionPrefs() {
    try {
      const now = Date.now();
      const raw = JSON.parse(localStorage.getItem(this.key(SUGGEST_SNOOZE_KEY)) ?? '{}') as Record<string, number>;
      this.snoozes.set(Object.fromEntries(Object.entries(raw).filter(([, until]) => typeof until === 'number' && until > now)));
      const counts = JSON.parse(localStorage.getItem(this.key(SUGGEST_COUNTS_KEY)) ?? '{}') as Record<string, number>;
      this.dismissCounts.set(counts && typeof counts === 'object' ? counts : {});
    } catch {
      // Fresh start.
    }
  }

  readonly suggestionIcon: Record<SuggestionKind, string> = {
    quiet: 'pi-user',
    overdue: 'pi-exclamation-circle',
    draft: 'pi-send',
    unbilled: 'pi-clock',
    combo: 'pi-sparkles',
  };

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /** Saving starts after the saved view is read, so defaults never overwrite it. */
  private prefsLoaded = false;

  /** Read the saved view (keys are per person, so wait until we know who is signed in). */
  private loadPrefs() {
    try {
      const saved = localStorage.getItem(this.key(FIN_RANGE_KEY)) as FinRange | null;
      if (saved && this.finRangeOptions.some((o) => o.value === saved)) this.finRange.set(saved);
      const scope = localStorage.getItem(this.key(SCOPE_KEY));
      if (scope === 'mine' || scope === 'everyone') this.mine.set(scope === 'mine');
      if (localStorage.getItem(this.key(WEATHER_OPEN_KEY)) === '1') this.weatherShown.set(true);
      // Card order, hidden cards, suggestion snoozes and last visit are per person too.
      this.loadOrder();
      this.loadHidden();
      this.loadSuggestionPrefs();
      this.loadLastVisit();
    } catch {
      // Defaults.
    }
    this.prefsLoaded = true;
  }

  constructor() {
    effect(() => {
      const id = this.session.me()?.id;
      untracked(() => {
        if (id && !this.prefsLoaded) this.loadPrefs();
      });
    });
    // Remember the view: Mine / Everyone's, the Financial health range and the weather toggle.
    effect(() => {
      const mine = this.mine();
      const range = this.finRange();
      const weatherOpen = this.weatherShown();
      untracked(() => {
        if (!this.prefsLoaded || this.wxPreview()) return;
        try {
          localStorage.setItem(this.key(SCOPE_KEY), mine ? 'mine' : 'everyone');
          localStorage.setItem(this.key(FIN_RANGE_KEY), range);
          localStorage.setItem(this.key(WEATHER_OPEN_KEY), weatherOpen ? '1' : '0');
        } catch {
          // Not remembered.
        }
      });
    });
    effect(() => {
      const mine = this.mine();
      untracked(() => {
        if (this.can('inbox')) void this.loadQueues(mine);
      });
    });
    // Unbilled work and Net follow both Mine / Everyone's and the Financial health range.
    effect(() => {
      const mine = this.mine();
      const bounds = this.finBounds();
      untracked(() => {
        if (this.can('invoices')) void this.loadUnbilled(mine, bounds.from, bounds.to);
        if (this.can('invoices') && this.isAdmin()) void this.loadPnl(bounds.from, bounds.to);
      });
    });
  }

  ngOnInit() {

    this.timer = setInterval(() => this.tick.update((n) => n + 1), 30_000);
    if (!this.can('inbox')) this.queues.set({ loading: false, error: null, data: null });
    if (this.can('tasks')) void this.loadTasks();
    else this.tasks.set({ loading: false, error: null, data: [] });
    if (this.can('time')) void this.loadTime();
    if (this.can('invoices')) void this.loadInvoices();
    if (!(this.can('invoices') && this.isAdmin())) this.pnl.set({ loading: false, error: null, data: null });
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

  private async loadUnbilled(mine: boolean, from: Date, to: Date) {
    try {
      const q = `mine=${mine}&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
      this.unbilled.set({ loading: false, error: null, data: await this.api.get<Unbilled>(`/invoices/unbilled-summary?${q}`) });
    } catch (err) {
      this.unbilled.set({ loading: false, error: errorText(err, 'Could not load unbilled work'), data: null });
    }
  }

  /** Net for the range from the books (admins only; the accounting reports are admin-only). */
  private async loadPnl(fromDate: Date, toDate: Date) {
    try {
      const from = fromDate.toISOString();
      const to = toDate.toISOString();
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
