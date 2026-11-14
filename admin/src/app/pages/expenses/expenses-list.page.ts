import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { PersonComponent } from '../../ui/person/person.component';
import { ApiService } from '../../core/api.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { isPdfFile, isRasterImage } from '../../core/file-type.util';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import {
  LIST_VIEW_KEYS,
  listViewFilterString,
  patchListViewPrefs,
  periodFromListPrefs,
  periodToListFilter,
  readListViewPrefs,
} from '../../core/list-view-prefs.storage';
import { listPrefsUserId, loadListSearch, saveListSearch } from '../../core/list-view-prefs.util';
import { defaultPeriod, resolveReportPeriod } from '../../core/period.util';
import { PageComponent } from '../../ui/layout/page.component';
import { PeriodPickerComponent } from '../../ui/period-picker/period-picker.component';
import { FileViewerDialogComponent, type ViewerFile } from '../../ui/file-viewer/file-viewer-dialog.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { ExpenseModalComponent } from './expense-modal.component';
import { Expense, ExpenseBillingStatus, ExpenseProject, ExpenseReimbursementStatus } from './expense.types';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

type ProjectListItem = {
  id: string;
  name: string;
  isActive?: boolean;
  client: { id: string; name: string } | null;
  defaultExpenseReimbursable?: boolean;
  defaultExpenseBillable?: boolean;
};

type StatusFilter = ExpenseBillingStatus | ExpenseReimbursementStatus;
type TagSeverity = 'secondary' | 'info' | 'success' | 'warn';
type Option = { label: string; value: string };
type ExpenseGroup = { key: string; label: string; total: number; items: Expense[] };
type ExpenseFilterChipKey = 'period' | 'category' | 'client' | 'project' | 'status' | 'person' | 'search';
type ExpenseFilterChip = { key: ExpenseFilterChipKey; label: string; display: string };

const BILLING_TAG: Record<ExpenseBillingStatus, string> = {
  UNBILLED: 'Not billed',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
};
const REIMBURSEMENT_TAG: Record<ExpenseReimbursementStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  SUBMITTED: 'Submitted',
  REIMBURSED: 'Reimbursed',
};
/** Client billing workflow — never `secondary` (that is reserved for Billable/Reimbursable flags). */
const BILLING_SEVERITY: Record<ExpenseBillingStatus, TagSeverity> = {
  UNBILLED: 'info',
  INVOICED: 'info',
  PAID: 'success',
};

const REIMBURSEMENT_SEVERITY: Record<ExpenseReimbursementStatus, TagSeverity> = {
  NOT_SUBMITTED: 'info',
  SUBMITTED: 'warn',
  REIMBURSED: 'success',
};
@Component({
  selector: 'app-expenses-list-page',
  standalone: true,
  imports: [
    EmptyStateComponent,
    FileViewerDialogComponent,
    PersonComponent,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    SelectModule,
    ToolbarSearchFieldComponent,
    MessageModule,
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
  private readonly session = inject(SessionService);
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

  filtersOpen = signal(false);

  /** Dropdown / row meta filters (not period or search). */
  readonly activeFilterCount = computed(() => {
    let n = 0;
    if (this.statusFilter()) n++;
    if (this.clientFilter()) n++;
    if (this.projectFilter()) n++;
    if (this.personFilter()) n++;
    if (this.categoryFilter()) n++;
    return n;
  });

  /** Shown above the expense list (period, dropdown filters, search). */
  /** Filters other than the period (category, account, project, status, person, search). */
  readonly hasNarrowingFilters = computed(() => this.activeFilterChips().some((c) => c.key !== 'period'));

  readonly activeFilterChips = computed((): ExpenseFilterChip[] => {
    const chips: ExpenseFilterChip[] = [];
    const bounds = resolveReportPeriod(this.period());
    if (bounds) {
      chips.push({ key: 'period', label: 'Period', display: bounds.label });
    } else if (this.period().periodType === 'custom') {
      chips.push({ key: 'period', label: 'Period', display: 'Custom range (incomplete)' });
    }
    const category = this.categoryFilter();
    if (category) chips.push({ key: 'category', label: 'Category', display: category });
    const clientId = this.clientFilter();
    if (clientId) {
      const label = this.clientOptions().find((o) => o.value === clientId)?.label ?? clientId;
      chips.push({ key: 'client', label: 'Client', display: label });
    }
    const projectId = this.projectFilter();
    if (projectId) {
      const label = this.projectOptions().find((o) => o.value === projectId)?.label ?? projectId;
      chips.push({ key: 'project', label: 'Project', display: label });
    }
    const status = this.statusFilter();
    if (status) {
      const label = this.statusOptions.find((o) => o.value === status)?.label ?? status;
      chips.push({ key: 'status', label: 'Status', display: label });
    }
    const personId = this.personFilter();
    if (personId) {
      const label = this.personOptions().find((o) => o.value === personId)?.label ?? personId;
      chips.push({ key: 'person', label: 'Person', display: label });
    }
    const q = this.searchDebounced().trim();
    if (q) chips.push({ key: 'search', label: 'Search', display: q });
    return chips;
  });

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

  readonly receiptViewer = signal<ViewerFile | null>(null);

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

  readonly expenseGroups = computed((): ExpenseGroup[] => {
    const sorted = [...this.filteredExpenses()].sort(
      (a, b) => new Date(b.incurredAt).getTime() - new Date(a.incurredAt).getTime(),
    );
    const groups: ExpenseGroup[] = [];
    const byKey = new Map<string, ExpenseGroup>();
    for (const expense of sorted) {
      const d = new Date(expense.incurredAt);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      let group = byKey.get(key);
      if (!group) {
        const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(d);
        group = { key, label, total: 0, items: [] };
        byKey.set(key, group);
        groups.push(group);
      }
      group.items.push(expense);
      group.total = Math.round((group.total + Number(expense.amount)) * 100) / 100;
    }
    return groups;
  });

  constructor() {
    effect(() => {
      this.period();
      untracked(() => void this.loadExpenses());
    });
    effect(() => {
      this.period();
      this.statusFilter();
      this.clientFilter();
      this.projectFilter();
      this.personFilter();
      this.categoryFilter();
      this.filtersOpen();
      this.searchDebounced();
      untracked(() => this.persistListPrefs());
    });
  }

  async ngOnInit() {
    this.restoreListPrefs();
    try {
      const projects = await this.api.get<ProjectListItem[]>('/projects');
      this.projects.set(projects.filter((p) => p.isActive !== false));
    } catch {
      /* the project filter just stays empty */
    }
  }

  private restoreListPrefs() {
    const prefs = readListViewPrefs(listPrefsUserId(this.session), LIST_VIEW_KEYS.expenses);
    const search = loadListSearch(this.session, LIST_VIEW_KEYS.expenses);
    if (search) {
      this.searchQuery = search;
      this.searchDebounced.set(search);
    }
    const period = periodFromListPrefs(prefs);
    if (period) this.period.set(period);
    const f = prefs.filters ?? {};
    const status = listViewFilterString(prefs, 'status');
    if (status) this.statusFilter.set(status as StatusFilter);
    const client = listViewFilterString(prefs, 'client');
    if (client) this.clientFilter.set(client);
    const project = listViewFilterString(prefs, 'project');
    if (project) this.projectFilter.set(project);
    const person = listViewFilterString(prefs, 'person');
    if (person) this.personFilter.set(person);
    const category = listViewFilterString(prefs, 'category');
    if (category) this.categoryFilter.set(category);
    if (f['filtersOpen'] === 'true') this.filtersOpen.set(true);
  }

  private persistListPrefs() {
    const filters: Record<string, string | boolean> = {
      period: periodToListFilter(this.period()),
    };
    const status = this.statusFilter();
    if (status) filters['status'] = status;
    const client = this.clientFilter();
    if (client) filters['client'] = client;
    const project = this.projectFilter();
    if (project) filters['project'] = project;
    const person = this.personFilter();
    if (person) filters['person'] = person;
    const category = this.categoryFilter();
    if (category) filters['category'] = category;
    if (this.filtersOpen()) filters['filtersOpen'] = 'true';
    patchListViewPrefs(listPrefsUserId(this.session), LIST_VIEW_KEYS.expenses, {
      search: this.searchDebounced().trim() || undefined,
      filters,
    });
  }

  toggleFilters() {
    this.filtersOpen.update((open) => !open);
    this.persistListPrefs();
  }

  clearFilterChip(key: ExpenseFilterChipKey) {
    switch (key) {
      case 'period':
        this.period.set(defaultPeriod());
        break;
      case 'category':
        this.categoryFilter.set('');
        break;
      case 'client':
        this.onClientFilter(null);
        break;
      case 'project':
        this.projectFilter.set('');
        break;
      case 'status':
        this.statusFilter.set('');
        break;
      case 'person':
        this.personFilter.set('');
        break;
      case 'search':
        this.searchQuery = '';
        this.searchDebounced.set('');
        if (this.searchTimer) {
          clearTimeout(this.searchTimer);
          this.searchTimer = null;
        }
        break;
    }
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      saveListSearch(this.session, LIST_VIEW_KEYS.expenses, value);
      this.persistListPrefs();
      this.searchTimer = null;
    }, 150);
  }

  onClientFilter(clientId: string | null) {
    this.clientFilter.set(clientId ?? '');
    if (this.projectFilter() && !this.projectOptions().some((p) => p.value === this.projectFilter())) {
      this.projectFilter.set('');
    }
    this.persistListPrefs();
  }

  filterByCategory(category: string, event: Event) {
    event.stopPropagation();
    this.categoryFilter.set(category);
    this.filtersOpen.set(true);
  }

  filterByClient(clientId: string, event: Event) {
    event.stopPropagation();
    this.onClientFilter(clientId);
    this.filtersOpen.set(true);
  }

  filterByProject(projectId: string, event: Event) {
    event.stopPropagation();
    this.projectFilter.set(projectId);
    this.filtersOpen.set(true);
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

  billingStatusTag(s: ExpenseBillingStatus) {
    return BILLING_TAG[s];
  }

  reimbursementStatusTag(s: ExpenseReimbursementStatus) {
    return REIMBURSEMENT_TAG[s];
  }

  showBillingStatusTag(e: Expense): e is Expense & { billingStatus: ExpenseBillingStatus } {
    return !!e.isBillable && !!e.billingStatus;
  }

  /** Reimbursement tag; skip duplicate “not started” when client billing is still unbilled too. */
  showReimbursementStatusTag(e: Expense): e is Expense & { reimbursementStatus: ExpenseReimbursementStatus } {
    if (!e.isReimbursable || !e.reimbursementStatus) return false;
    if (
      e.reimbursementStatus === 'NOT_SUBMITTED' &&
      e.isBillable &&
      e.billingStatus === 'UNBILLED'
    ) {
      return false;
    }
    return true;
  }

  billingSeverity(s: ExpenseBillingStatus): TagSeverity {
    return BILLING_SEVERITY[s];
  }

  reimbursementSeverity(s: ExpenseReimbursementStatus): TagSeverity {
    return REIMBURSEMENT_SEVERITY[s];
  }

  showAnyStatusTag(e: Expense): boolean {
    return (
      e.isBillable ||
      e.isReimbursable ||
      !!e.billingInvoice ||
      !!e.reimbursementInvoice
    );
  }

  openReceipt(e: Expense, event: Event) {
    event.stopPropagation();
    const url = resolveAssetUrl(e.receiptUrl ?? null);
    if (!url) return;
    const name = e.receiptFileName?.trim() || 'Receipt';
    if (isRasterImage(name, null) || isRasterImage(url, null)) {
      this.receiptViewer.set({ name, kind: 'image', url });
      return;
    }
    if (isPdfFile(name, null) || isPdfFile(url, null)) {
      this.receiptViewer.set({ name, kind: 'pdf', url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
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
