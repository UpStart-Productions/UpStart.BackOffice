import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { isAdminRole } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { formatDurationMin } from '../time-entry/timesheet.utils';
import {
  REPORT_MONTHS,
  REPORT_QUARTERS,
  dateInPeriod,
  resolveReportPeriod,
  type ReportPeriodType,
} from './report-period.util';

type Client = { id: string; name: string };
type User = { id: string; firstName?: string | null; lastName?: string | null; email: string };

type TimeEntry = {
  id: string;
  description?: string | null;
  startedAt: string;
  stoppedAt?: string | null;
  durationMin?: number | null;
  isBillable: boolean;
  user?: User | null;
  project: {
    id: string;
    name: string;
    isBillable: boolean;
    client: { id: string; name: string };
  };
  projectTask?: { id: string; name: string; isBillable: boolean } | null;
};

type Invoice = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  client: { id: string; name: string };
};

type TimeProjectRow = {
  clientName: string;
  projectName: string;
  totalMin: number;
  billableMin: number;
  nonBillableMin: number;
  entryCount: number;
};

type InvoiceClientRow = {
  clientName: string;
  invoiceCount: number;
  total: number;
  paid: number;
  sent: number;
  draft: number;
};

@Component({
  selector: 'app-reports-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    UIChart,
    MessageModule,
    SelectModule,
    TableModule,
    TabsModule,
    TagModule,
    PageComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly months = REPORT_MONTHS;
  readonly quarters = REPORT_QUARTERS;

  activeTab = 0;
  loading = signal(false);
  error = signal<string | null>(null);
  periodLabel = signal<string | null>(null);
  hasRun = signal(false);

  clients = signal<Client[]>([]);
  users = signal<User[]>([]);
  isAdmin = signal(false);

  private readonly now = new Date();
  readonly yearOptions = [
    this.now.getFullYear() - 2,
    this.now.getFullYear() - 1,
    this.now.getFullYear(),
    this.now.getFullYear() + 1,
  ];

  filters = {
    periodType: 'month' as ReportPeriodType,
    month: this.now.getMonth() + 1,
    year: this.now.getFullYear(),
    quarter: Math.floor(this.now.getMonth() / 3) + 1,
    from: '',
    to: '',
    clientId: '' as string,
    userId: '' as string,
  };

  private timeEntries = signal<TimeEntry[]>([]);
  private invoices = signal<Invoice[]>([]);

  readonly periodTypeOptions = [
    { label: 'Month', value: 'month' as ReportPeriodType },
    { label: 'Quarter', value: 'quarter' as ReportPeriodType },
    { label: 'Custom range', value: 'custom' as ReportPeriodType },
  ];

  readonly clientOptions = computed(() => [
    { label: 'All clients', value: '' },
    ...this.clients().map((c) => ({ label: c.name, value: c.id })),
  ]);

  readonly userOptions = computed(() => [
    { label: 'All users', value: '' },
    ...this.users().map((u) => ({ label: this.userLabel(u), value: u.id })),
  ]);

  readonly timeByProject = computed((): TimeProjectRow[] => {
    const map = new Map<string, TimeProjectRow>();
    for (const e of this.completedTimeEntries()) {
      const key = e.project.id;
      const min = e.durationMin ?? 0;
      const row =
        map.get(key) ??
        ({
          clientName: e.project.client.name,
          projectName: e.project.name,
          totalMin: 0,
          billableMin: 0,
          nonBillableMin: 0,
          entryCount: 0,
        } satisfies TimeProjectRow);
      row.totalMin += min;
      if (this.isEntryBillable(e)) row.billableMin += min;
      else row.nonBillableMin += min;
      row.entryCount += 1;
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.totalMin - a.totalMin || a.clientName.localeCompare(b.clientName),
    );
  });

  readonly totalTimeChart = computed(() =>
    this.buildProjectChart(this.timeByProject(), (r) => r.totalMin),
  );

  readonly billableTimeChart = computed(() =>
    this.buildProjectChart(this.timeByProject(), (r) => r.billableMin),
  );

  readonly nonBillableTimeChart = computed(() =>
    this.buildProjectChart(this.timeByProject(), (r) => r.nonBillableMin),
  );

  readonly timeSummary = computed(() => {
    const entries = this.completedTimeEntries();
    let totalMin = 0;
    let billableMin = 0;
    for (const e of entries) {
      const min = e.durationMin ?? 0;
      totalMin += min;
      if (this.isEntryBillable(e)) billableMin += min;
    }
    return {
      totalMin,
      billableMin,
      nonBillableMin: totalMin - billableMin,
      entryCount: entries.length,
    };
  });

  readonly invoiceSummary = computed(() => {
    const list = this.filteredInvoices();
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const inv of list) {
      total += Number(inv.total);
      byStatus[inv.status] = (byStatus[inv.status] ?? 0) + 1;
    }
    return {
      count: list.length,
      total,
      draft: byStatus['DRAFT'] ?? 0,
      sent: byStatus['SENT'] ?? 0,
      paid: byStatus['PAID'] ?? 0,
      void: byStatus['VOID'] ?? 0,
    };
  });

  readonly invoicesByClient = computed((): InvoiceClientRow[] => {
    const map = new Map<string, InvoiceClientRow>();
    for (const inv of this.filteredInvoices()) {
      const key = inv.client.id;
      const row =
        map.get(key) ??
        ({
          clientName: inv.client.name,
          invoiceCount: 0,
          total: 0,
          paid: 0,
          sent: 0,
          draft: 0,
        } satisfies InvoiceClientRow);
      row.invoiceCount += 1;
      row.total += Number(inv.total);
      if (inv.status === 'PAID') row.paid += Number(inv.total);
      else if (inv.status === 'SENT') row.sent += Number(inv.total);
      else if (inv.status === 'DRAFT') row.draft += Number(inv.total);
      map.set(key, row);
    }
    return [...map.values()].sort(
      (a, b) => b.total - a.total || a.clientName.localeCompare(b.clientName),
    );
  });

  readonly filteredInvoicesList = computed(() =>
    [...this.filteredInvoices()].sort(
      (a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime(),
    ),
  );

  async ngOnInit() {
    const me = await this.session.getReady();
    this.isAdmin.set(isAdminRole(me?.role ?? 'MEMBER'));

    const [clients, usersResult] = await Promise.all([
      this.api.get<Client[]>('/clients').catch(() => [] as Client[]),
      this.isAdmin()
        ? this.api.get<{ users: User[] }>('/users').catch(() => ({ users: [] as User[] }))
        : Promise.resolve({ users: [] as User[] }),
    ]);
    this.clients.set(clients);
    this.users.set(usersResult.users);
  }

  async runReport() {
    const bounds = resolveReportPeriod({
      periodType: this.filters.periodType,
      month: this.filters.month,
      year: this.filters.year,
      quarter: this.filters.quarter,
      from: this.filters.from,
      to: this.filters.to,
    });

    if (!bounds) {
      this.error.set(
        this.filters.periodType === 'custom'
          ? 'Select a valid custom date range.'
          : 'Select a valid reporting period.',
      );
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.periodLabel.set(bounds.label);

    try {
      const params = new URLSearchParams({
        from: bounds.from.toISOString(),
        to: bounds.to.toISOString(),
      });
      if (this.filters.userId) {
        params.set('userId', this.filters.userId);
      }

      const [entries, invoices] = await Promise.all([
        this.api.get<TimeEntry[]>(`/time-entries?${params}`),
        this.api.get<Invoice[]>('/invoices'),
      ]);

      const clientId = this.filters.clientId;
      this.timeEntries.set(
        entries.filter((e) => !clientId || e.project.client.id === clientId),
      );
      this.invoices.set(
        invoices.filter((inv) => {
          if (clientId && inv.client.id !== clientId) return false;
          return dateInPeriod(inv.issueDate, bounds.from, bounds.to);
        }),
      );
      this.hasRun.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to run report');
    } finally {
      this.loading.set(false);
    }
  }

  formatMin(min: number): string {
    return formatDurationMin(min);
  }

  formatAmount(n: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  statusSeverity(status: string): 'success' | 'info' | 'warn' | 'secondary' | 'danger' {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'SENT':
        return 'info';
      case 'DRAFT':
        return 'warn';
      case 'VOID':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  private completedTimeEntries(): TimeEntry[] {
    return this.timeEntries().filter((e) => e.stoppedAt && (e.durationMin ?? 0) > 0);
  }

  private isEntryBillable(entry: TimeEntry): boolean {
    return entry.project.isBillable && entry.isBillable;
  }

  private buildProjectChart(
    rows: TimeProjectRow[],
    getMin: (row: TimeProjectRow) => number,
  ): { data: { labels: string[]; datasets: { data: number[]; backgroundColor: string[] }[] }; options: Record<string, unknown> } | null {
    const filtered = rows.filter((r) => getMin(r) > 0);
    if (filtered.length === 0) return null;

    const colors = [
      '#7c3aed',
      '#1565c0',
      '#2e7d32',
      '#f59e0b',
      '#ef4444',
      '#0891b2',
      '#9333ea',
      '#ea580c',
    ];

    return {
      data: {
        labels: filtered.map((r) => r.projectName),
        datasets: [
          {
            data: filtered.map((r) => Math.round((getMin(r) / 60) * 100) / 100),
            backgroundColor: filtered.map((_, i) => colors[i % colors.length]),
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: 'right',
            labels: { boxWidth: 10, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              title: (items: { dataIndex: number }[]) => {
                const row = filtered[items[0].dataIndex];
                return `${row.clientName} — ${row.projectName}`;
              },
              label: (ctx: { parsed: number }) => `${ctx.parsed} hrs`,
            },
          },
        },
        maintainAspectRatio: false,
      },
    };
  }

  private filteredInvoices(): Invoice[] {
    return this.invoices();
  }

  private userLabel(u: User): string {
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return name || u.email;
  }
}
