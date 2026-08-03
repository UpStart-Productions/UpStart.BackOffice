import { Component, computed, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SplitButtonModule } from 'primeng/splitbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { formatDurationMin } from '../time-entry/timesheet.utils';
import {
  REPORT_MONTHS,
  REPORT_QUARTERS,
  dateInPeriod,
  resolveReportPeriod,
  type ReportPeriodType,
} from './report-period.util';
import {
  exportTimeReportExcel,
  exportTimeReportPdf,
  type TimeReportExportData,
} from './time-report-export.util';
import {
  exportInvoiceReportExcel,
  exportInvoiceReportPdf,
  type InvoiceReportExportData,
} from './invoice-report-export.util';

type Client = { id: string; name: string };
type Project = { id: string; name: string; clientId: string };
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
    SplitButtonModule,
    TableModule,
    TabsModule,
    TagModule,
    PageComponent,
    DateInputComponent,
  ],
  templateUrl: './reports.page.html',
  styleUrl: './reports.page.scss',
})
export class ReportsPage implements OnInit {
  private readonly api = inject(ApiService);

  @ViewChild('totalChartRef') totalChartRef?: UIChart;
  @ViewChild('billableChartRef') billableChartRef?: UIChart;
  @ViewChild('nonBillableChartRef') nonBillableChartRef?: UIChart;

  readonly months = REPORT_MONTHS;
  readonly quarters = REPORT_QUARTERS;

  activeTab = 0;
  loading = signal(false);
  exporting = signal(false);
  error = signal<string | null>(null);
  periodLabel = signal<string | null>(null);
  hasRun = signal(false);
  /** Client/project filters applied on the last successful run (empty = all). */
  private appliedClientId = signal('');
  private appliedProjectId = signal('');

  clients = signal<Client[]>([]);
  projects = signal<Project[]>([]);
  private filteredProjects = signal<Project[]>([]);

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
    projectId: '' as string,
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

  readonly projectOptions = computed(() => [
    { label: 'All projects', value: '' },
    ...this.filteredProjects().map((p) => ({ label: p.name, value: p.id })),
  ]);

  readonly timeExportMenuItems: MenuItem[] = [
    {
      label: 'PDF',
      icon: 'pi pi-file-pdf',
      command: () => this.exportTimeReportPdf(),
    },
    {
      label: 'Excel',
      icon: 'pi pi-file-excel',
      command: () => this.exportTimeReportExcel(),
    },
  ];

  readonly invoiceExportMenuItems: MenuItem[] = [
    {
      label: 'PDF',
      icon: 'pi pi-file-pdf',
      command: () => this.exportInvoiceReportPdf(),
    },
    {
      label: 'Excel',
      icon: 'pi pi-file-excel',
      command: () => this.exportInvoiceReportExcel(),
    },
  ];

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

  /** When a client or project is selected, show individual entries instead of project rollup. */
  readonly showTimeEntryDetail = computed(
    () => Boolean(this.appliedClientId()) || Boolean(this.appliedProjectId()),
  );

  /** Hide Project column when the report is already scoped to one project. */
  readonly showProjectColumn = computed(() => !this.appliedProjectId());

  /** Date + optional Project + Task/Description ahead of Duration/Billable. */
  readonly timeEntryDetailLeadingColspan = computed(() => (this.showProjectColumn() ? 3 : 2));

  readonly timeEntryRows = computed(() =>
    [...this.completedTimeEntries()]
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .map((e) => ({
        id: e.id,
        startedAt: e.startedAt,
        projectName: e.project.name,
        taskName: e.projectTask?.name ?? '—',
        description: e.description?.trim() || '—',
        durationMin: e.durationMin ?? 0,
        billable: this.isEntryBillable(e),
      })),
  );

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
    const [clients, projects] = await Promise.all([
      this.api.get<Client[]>('/clients').catch(() => [] as Client[]),
      this.api.get<Project[]>('/projects').catch(() => [] as Project[]),
    ]);
    this.clients.set(clients);
    this.projects.set(projects);
    this.onClientChange();
  }

  onClientChange() {
    const clientId = this.filters.clientId;
    if (!clientId) {
      this.filteredProjects.set([]);
      this.filters.projectId = '';
      return;
    }
    this.filteredProjects.set(this.projects().filter((p) => p.clientId === clientId));
    if (
      this.filters.projectId &&
      !this.filteredProjects().some((p) => p.id === this.filters.projectId)
    ) {
      this.filters.projectId = '';
    }
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
      if (this.filters.projectId) {
        params.set('projectId', this.filters.projectId);
      }

      const [entries, invoices] = await Promise.all([
        this.api.get<TimeEntry[]>(`/time-entries?${params}`),
        this.api.get<Invoice[]>('/invoices'),
      ]);

      const clientId = this.filters.clientId;
      const projectId = this.filters.projectId;
      this.timeEntries.set(
        entries.filter((e) => {
          if (clientId && e.project.client.id !== clientId) return false;
          if (projectId && e.project.id !== projectId) return false;
          return true;
        }),
      );
      this.invoices.set(
        invoices.filter((inv) => {
          if (clientId && inv.client.id !== clientId) return false;
          return dateInPeriod(inv.issueDate, bounds.from, bounds.to);
        }),
      );
      this.appliedClientId.set(clientId);
      this.appliedProjectId.set(projectId);
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

  async exportTimeReportPdf() {
    await this.runTimeReportExport('pdf');
  }

  exportTimeReportExcel() {
    void this.runTimeReportExport('excel');
  }

  async exportInvoiceReportPdf() {
    await this.runInvoiceReportExport('pdf');
  }

  exportInvoiceReportExcel() {
    void this.runInvoiceReportExport('excel');
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

  private async runInvoiceReportExport(format: 'pdf' | 'excel') {
    if (this.filteredInvoicesList().length === 0) return;

    this.exporting.set(true);
    this.error.set(null);

    try {
      const exportData = this.buildInvoiceReportExportData();
      if (format === 'pdf') {
        await exportInvoiceReportPdf(exportData);
      } else {
        exportInvoiceReportExcel(exportData);
      }
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()} report`,
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private buildInvoiceReportExportData(): InvoiceReportExportData {
    const summary = this.invoiceSummary();
    const period = this.periodLabel() ?? 'report';

    return {
      periodLabel: period,
      filterSummary: this.invoiceExportFilterSummary(),
      summary: {
        total: summary.total,
        count: summary.count,
        paidCount: summary.paid,
        draftCount: summary.draft,
        sentCount: summary.sent,
      },
      byClient: this.invoicesByClient(),
      invoices: this.filteredInvoicesList().map((inv) => ({
        displayNumber: inv.displayNumber,
        clientName: inv.client.name,
        issueDate: this.formatDate(inv.issueDate),
        total: Number(inv.total),
        status: inv.status,
      })),
      filenameBase: `invoice-report-${this.pdfFilenameSegment(period)}`,
    };
  }

  private invoiceExportFilterSummary(): string | undefined {
    if (!this.filters.clientId) return undefined;
    const client = this.clients().find((c) => c.id === this.filters.clientId);
    return client ? `Client: ${client.name}` : undefined;
  }

  private async runTimeReportExport(format: 'pdf' | 'excel') {
    if (this.timeByProject().length === 0) return;

    this.exporting.set(true);
    this.error.set(null);

    try {
      const exportData = this.buildTimeReportExportData();
      if (format === 'pdf') {
        await exportTimeReportPdf(exportData);
      } else {
        exportTimeReportExcel(exportData);
      }
    } catch (err) {
      this.error.set(
        err instanceof Error ? err.message : `Failed to export ${format.toUpperCase()} report`,
      );
    } finally {
      this.exporting.set(false);
    }
  }

  private buildTimeReportExportData(): TimeReportExportData {
    const summary = this.timeSummary();
    const period = this.periodLabel() ?? 'report';

    return {
      periodLabel: period,
      filterSummary: this.exportFilterSummary(),
      summary,
      rows: this.timeByProject(),
      charts: {
        total: this.chartImageForExport(
          this.totalChartRef,
          `Total hrs (${this.formatMin(summary.totalMin)})`,
        ),
        billable: this.chartImageForExport(
          this.billableChartRef,
          `Billable hrs (${this.formatMin(summary.billableMin)})`,
        ),
        nonBillable: this.chartImageForExport(
          this.nonBillableChartRef,
          `Non-billable hrs (${this.formatMin(summary.nonBillableMin)})`,
        ),
      },
      filenameBase: `time-report-${this.pdfFilenameSegment(period)}`,
    };
  }

  private chartImageForExport(chart: UIChart | undefined, title: string) {
    if (!chart) return undefined;
    const imageDataUrl = chart.getBase64Image();
    if (!imageDataUrl) return undefined;
    return { title, imageDataUrl };
  }

  private exportFilterSummary(): string | undefined {
    const parts: string[] = [];
    if (this.filters.clientId) {
      const client = this.clients().find((c) => c.id === this.filters.clientId);
      if (client) parts.push(`Client: ${client.name}`);
    }
    if (this.filters.projectId) {
      const project = this.projects().find((p) => p.id === this.filters.projectId);
      if (project) parts.push(`Project: ${project.name}`);
    }
    return parts.length ? parts.join(' · ') : undefined;
  }

  private pdfFilenameSegment(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
