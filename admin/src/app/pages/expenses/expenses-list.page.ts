import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { defaultPeriod, resolveReportPeriod } from '../../core/period.util';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { PeriodPickerComponent } from '../../ui/period-picker/period-picker.component';
import { PersonComponent } from '../../ui/person/person.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { ExpenseModalComponent } from './expense-modal.component';
import { Expense, ExpenseBillingStatus, ExpenseProject, ExpenseReimbursementStatus } from './expense.types';

type ProjectListItem = {
  id: string;
  name: string;
  isActive?: boolean;
  client: { id: string; name: string } | null;
  defaultExpenseReimbursable?: boolean;
  defaultExpenseBillable?: boolean;
};

type StatusFilter = ExpenseBillingStatus | ExpenseReimbursementStatus;
type Option = { label: string; value: string };
type TagSeverity = 'secondary' | 'info' | 'success';
type BarSegment = { key: string; label: string; amount: number; color: string };

/** Donut colors, shared by both cards: amber = still to do, blue = on an invoice, green = paid. Purple stays reserved for buttons. */
const BAR_TODO = 'var(--color-severity-warning-text)';
const BAR_ON_INVOICE = 'var(--color-severity-info-text)';
const BAR_PAID = 'var(--color-severity-success-text)';

const BILLING_LABELS: Record<ExpenseBillingStatus, string> = {
  UNBILLED: 'Not billed',
  INVOICED: 'Invoiced',
  PAID: 'Client paid',
};
const REIMBURSEMENT_LABELS: Record<ExpenseReimbursementStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  REIMBURSED: 'Reimbursed',
};
const STATUS_SEVERITY: Record<StatusFilter, TagSeverity> = {
  UNBILLED: 'secondary',
  INVOICED: 'info',
  PAID: 'success',
  NOT_SUBMITTED: 'secondary',
  SUBMITTED: 'info',
  REIMBURSED: 'success',
};

@Component({
  selector: 'app-expenses-list-page',
  standalone: true,
  imports: [
    HelpTextComponent,
    PersonComponent,
    DatePipe,
    NgTemplateOutlet,
    FormsModule,
    RouterLink,
    ButtonModule,
    SelectModule,
    ToolbarSearchFieldComponent,
    MessageModule,
    TableModule,
    TagModule,
    PageComponent,
    PeriodPickerComponent,
    RowActionsMenuComponent,
    ExpenseModalComponent,
  ],
  templateUrl: './expenses-list.page.html',
  styleUrl: './expenses-list.page.scss',
})
export class ExpensesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly modal = viewChild.required(ExpenseModalComponent);

  expenses = signal<Expense[]>([]);
  projects = signal<ExpenseProject[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  /** The period shown (app-period-picker); this month by default. Changing it reloads. */
  period = signal(defaultPeriod());

  statusFilter = signal<StatusFilter | ''>('');
  clientFilter = signal('');
  projectFilter = signal('');
  personFilter = signal('');
  categoryFilter = signal('');
  searchQuery = '';
  searchDebounced = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly statusOptions: Option[] = [
    { label: 'Not billed', value: 'UNBILLED' },
    { label: 'Invoiced', value: 'INVOICED' },
    { label: 'Client paid', value: 'PAID' },
    { label: 'Not submitted', value: 'NOT_SUBMITTED' },
    { label: 'Submitted', value: 'SUBMITTED' },
    { label: 'Reimbursed', value: 'REIMBURSED' },
  ];

  readonly clientOptions = computed<Option[]>(() => {
    const byId = new Map<string, string>();
    for (const p of this.projects()) if (p.client) byId.set(p.client.id, p.client.name);
    return [...byId].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly projectOptions = computed<Option[]>(() =>
    this.projects()
      .filter((p) => !this.clientFilter() || p.client?.id === this.clientFilter())
      .map((p) => ({ label: p.name, value: p.id }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );

  /** People and categories that appear in the period. */
  readonly personOptions = computed<Option[]>(() => {
    const byId = new Map<string, string>();
    for (const e of this.expenses()) byId.set(e.user.id, this.submittedByName(e));
    return [...byId].map(([value, label]) => ({ label, value })).sort((a, b) => a.label.localeCompare(b.label));
  });

  readonly categoryOptions = computed<Option[]>(() =>
    [...new Set(this.expenses().map((e) => e.category?.trim()).filter((c): c is string => !!c))]
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ label: c, value: c })),
  );

  readonly filteredExpenses = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const status = this.statusFilter();
    const client = this.clientFilter();
    const project = this.projectFilter();
    const person = this.personFilter();
    const category = this.categoryFilter();
    return this.expenses().filter(
      (e) =>
        (!status || e.billingStatus === status || e.reimbursementStatus === status) &&
        (!client || e.project?.client?.id === client) &&
        (!project || e.project?.id === project) &&
        (!person || e.user.id === person) &&
        (!category || (e.category ?? '').trim() === category) &&
        (!q || this.matchesSearch(e, q)),
    );
  });

  /** Summary for the period and filters: total, billable by status, reimbursable by status. */
  readonly summary = computed(() => {
    const sum = (list: Expense[]) => Math.round(list.reduce((s, e) => s + Number(e.amount), 0) * 100) / 100;
    const list = this.filteredExpenses();
    const billable = list.filter((e) => e.billingStatus);
    const reimbursable = list.filter((e) => e.reimbursementStatus);
    return {
      total: sum(list),
      count: list.length,
      billable: sum(billable),
      unbilled: sum(billable.filter((e) => e.billingStatus === 'UNBILLED')),
      invoiced: sum(billable.filter((e) => e.billingStatus === 'INVOICED')),
      clientPaid: sum(billable.filter((e) => e.billingStatus === 'PAID')),
      reimbursable: sum(reimbursable),
      notSubmitted: sum(reimbursable.filter((e) => e.reimbursementStatus === 'NOT_SUBMITTED')),
      submitted: sum(reimbursable.filter((e) => e.reimbursementStatus === 'SUBMITTED')),
      reimbursed: sum(reimbursable.filter((e) => e.reimbursementStatus === 'REIMBURSED')),
    };
  });

  readonly billingSegments = computed<BarSegment[]>(() => {
    const s = this.summary();
    return [
      { key: 'unbilled', label: 'Not billed', amount: s.unbilled, color: BAR_TODO },
      { key: 'invoiced', label: 'Invoiced', amount: s.invoiced, color: BAR_ON_INVOICE },
      { key: 'paid', label: 'Client paid', amount: s.clientPaid, color: BAR_PAID },
    ];
  });

  readonly reimbursementSegments = computed<BarSegment[]>(() => {
    const s = this.summary();
    return [
      { key: 'notSubmitted', label: 'Not submitted', amount: s.notSubmitted, color: BAR_TODO },
      { key: 'submitted', label: 'Submitted', amount: s.submitted, color: BAR_ON_INVOICE },
      { key: 'reimbursed', label: 'Reimbursed', amount: s.reimbursed, color: BAR_PAID },
    ];
  });

  /** Donut arcs (out of 100) for the segments with an amount, with a small gap between arcs. */
  donutArcs(segments: BarSegment[]): { key: string; color: string; start: number; length: number }[] {
    const parts = segments.filter((seg) => seg.amount > 0);
    const total = parts.reduce((sum, seg) => sum + seg.amount, 0);
    if (!total) return [];
    const gap = parts.length > 1 ? 1.5 : 0;
    let start = 0;
    return parts.map((seg) => {
      const share = (seg.amount / total) * 100;
      const arc = { key: seg.key, color: seg.color, start: start + gap / 2, length: Math.max(share - gap, 0.5) };
      start += share;
      return arc;
    });
  }

  barLabel(segments: BarSegment[]): string {
    return segments.map((seg) => `${seg.label} ${this.formatAmount(seg.amount)}`).join(', ');
  }

  constructor() {
    effect(() => {
      this.period();
      untracked(() => void this.loadExpenses());
    });
  }

  async ngOnInit() {
    try {
      const projects = await this.api.get<ProjectListItem[]>('/projects');
      this.projects.set(projects.filter((p) => p.isActive !== false));
    } catch {
      /* the project filter just stays empty */
    }
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      this.searchTimer = null;
    }, 150);
  }

  onClientFilter(clientId: string | null) {
    this.clientFilter.set(clientId ?? '');
    if (this.projectFilter() && !this.projectOptions().some((p) => p.value === this.projectFilter())) {
      this.projectFilter.set('');
    }
  }

  private matchesSearch(e: Expense, q: string): boolean {
    const haystack = [
      e.description,
      e.category ?? '',
      e.project?.name ?? '',
      e.project?.client?.name ?? 'Personal',
      e.paymentMethod ?? '',
      e.billingInvoice?.displayNumber ?? '',
      e.reimbursementInvoice?.displayNumber ?? '',
      [e.user.firstName, e.user.lastName].filter(Boolean).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  submittedByName(e: Expense): string {
    return [e.user.firstName, e.user.lastName].filter(Boolean).join(' ') || e.user.email;
  }

  formatAmount(n: number): string {
    return '$' + Number(n).toFixed(2);
  }

  billingLabel(s: ExpenseBillingStatus) {
    return BILLING_LABELS[s];
  }

  reimbursementLabel(s: ExpenseReimbursementStatus) {
    return REIMBURSEMENT_LABELS[s];
  }

  severity(s: StatusFilter): TagSeverity {
    return STATUS_SEVERITY[s];
  }

  /** On an invoice: amount, project and the toggles are locked, and it can't be deleted. */
  isOnInvoice(e: Expense): boolean {
    return !!(e.billingInvoice || e.reimbursementInvoice);
  }

  getRowActions(e: Expense): RowActionItem[] {
    return [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => void this.openEdit(e) },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        disabled: this.isOnInvoice(e),
        command: () => this.deleteExpense(e),
      },
    ];
  }

  async loadExpenses() {
    const bounds = resolveReportPeriod(this.period());
    if (!bounds) {
      // Custom range not finished yet: keep the current list.
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = new URLSearchParams({ from: bounds.from.toISOString(), to: bounds.to.toISOString() });
      const expenses = await this.api.get<Expense[]>(`/expenses?${params}`);
      this.expenses.set(expenses.map((e) => ({ ...e, amount: Number(e.amount) })));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      this.loading.set(false);
    }
  }

  async openNew() {
    const result = await this.modal().open({ projects: this.projects() });
    if (result === 'saved' || result === 'deleted') await this.loadExpenses();
  }

  async openEdit(expense: Expense) {
    const result = await this.modal().open({ projects: this.projects(), expense });
    if (result === 'saved' || result === 'deleted') await this.loadExpenses();
  }

  private deleteExpense(e: Expense) {
    this.confirmDelete.confirm({
      message: `Delete "${e.description}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/expenses/${e.id}`);
          await this.loadExpenses();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
