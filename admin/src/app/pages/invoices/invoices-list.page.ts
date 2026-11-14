import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { LIST_VIEW_KEYS } from '../../core/list-view-prefs.storage';
import { loadListSearch, loadTableSort, onTableSortSave, saveListSearch } from '../../core/list-view-prefs.util';
import { PageComponent } from '../../ui/layout/page.component';
import { AppDialogModule } from '../../core/app-dialog.module';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';
import { InvoiceMarkPaidDialogService } from './invoice-mark-paid-dialog.service';
import { invoiceDueFlag } from './invoice-status.util';
import { EmptyGhostCell, EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

type Invoice = {
  id: string;
  number: number;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  total: number;
  billTo?: 'CLIENT' | 'TENANT';
  billToName?: string | null;
  /** Null when the invoice is billed to the business. */
  client: { id: string; name: string } | null;
  createdBy?: { id: string; firstName?: string | null; lastName?: string | null; email: string } | null;
};

type InvoiceTableRow = Invoice & {
  billToSort: string;
  createdBySort: string;
};

@Component({
  selector: 'app-invoices-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ToolbarSearchFieldComponent,
    TableModule,
    MessageModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
    AppDialogModule,
    DateInputComponent,
    HelpTextComponent,
    EmptyStateComponent,
  ],
  templateUrl: './invoices-list.page.html',
  styles: [
    `
      :host ::ng-deep tr.invoice-row-overdue > td {
        background: var(--color-severity-danger-bg);
      }

      :host ::ng-deep tr.invoice-row-due > td {
        background: var(--color-severity-warning-bg);
      }

      .invoice-due-cell {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
    `,
  ],
})
export class InvoicesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);
  private readonly invoiceMarkPaidDialog = inject(InvoiceMarkPaidDialogService);
  private readonly session = inject(SessionService);

  invoices = signal<Invoice[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');
  tableSortField = signal('issueDate');
  tableSortOrder = signal<1 | -1>(-1);

  exportVisible = false;
  exportFrom = '';
  exportTo = '';
  exporting = signal(false);
  exportError = signal<string | null>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly searchedInvoices = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.invoices();
    if (!q) return list;
    return list.filter((invoice) => this.invoiceMatchesSearch(invoice, q));
  });

  readonly invoiceTableRows = computed((): InvoiceTableRow[] =>
    this.searchedInvoices().map((inv) => ({
      ...inv,
      billToSort: this.billToLabel(inv),
      createdBySort: this.createdByLabel(inv),
    })),
  );

  readonly headerMenuActions = computed<RowActionItem[]>(() => [
    {
      id: 'export',
      label: 'Export all invoices',
      icon: 'pi pi-download',
      command: () => this.openExport(),
    },
  ]);

  /** Ghost columns, one per table header (actions, number, bill to, created by, issue, due, total, status). */
  readonly ghostColumns: EmptyGhostCell[] = ['blank', 'strong', 'avatar-text', 'text', 'date', 'date', 'amount', 'tag'];
  /** No invoices at all yet (not a search with no matches): show the ghosted empty state. */
  readonly firstRunEmpty = computed(() => !this.loading() && !this.error() && this.invoices().length === 0);

  readonly emptyMessage = computed(() => {
    if (this.searchDebounced().trim() && this.searchedInvoices().length === 0 && this.invoices().length > 0) {
      return 'No invoices match your search.';
    }
    return 'No invoices yet.';
  });

  async ngOnInit() {
    const search = loadListSearch(this.session, LIST_VIEW_KEYS.invoices);
    if (search) {
      this.searchQuery = search;
      this.searchDebounced.set(search);
    }
    const sort = loadTableSort(this.session, LIST_VIEW_KEYS.invoices, { field: 'issueDate', order: -1 });
    this.tableSortField.set(sort.field);
    this.tableSortOrder.set(sort.order);
    await this.load();
  }

  onTableSort(event: { field?: string | string[] | null; order?: number | null }) {
    const saved = onTableSortSave(this.session, LIST_VIEW_KEYS.invoices, event);
    if (saved) {
      this.tableSortField.set(saved.field);
      this.tableSortOrder.set(saved.order);
    }
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      saveListSearch(this.session, LIST_VIEW_KEYS.invoices, value);
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced.set('');
    saveListSearch(this.session, LIST_VIEW_KEYS.invoices, '');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  billToLabel(inv: Invoice): string {
    return inv.billToName || inv.client?.name || '';
  }

  createdByLabel(inv: Invoice): string {
    const u = inv.createdBy;
    return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email : '';
  }

  private invoiceMatchesSearch(invoice: Invoice, q: string): boolean {
    const haystack = [
      invoice.displayNumber,
      this.billToLabel(invoice),
      this.createdByLabel(invoice),
      invoice.status,
      invoice.issueDate,
      invoice.dueDate,
      this.formatDate(invoice.issueDate),
      invoice.dueDate ? this.formatDate(invoice.dueDate) : '',
      this.formatAmount(invoice.total),
      String(invoice.total),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  /** Defaults to last month. */
  openExport() {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    const ymd = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.exportFrom = ymd(first);
    this.exportTo = ymd(last);
    this.exportError.set(null);
    this.exportVisible = true;
  }

  async downloadExport() {
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const params = new URLSearchParams({ from: this.exportFrom.slice(0, 10), to: this.exportTo.slice(0, 10) });
      const res = await this.api.get<{ filename: string; csv: string; count: number }>(`/invoices/payroll-export?${params}`);
      if (res.count === 0) {
        this.exportError.set('No Sent or Paid invoices to your business in this range.');
        return;
      }
      const url = URL.createObjectURL(new Blob([res.csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
      this.exportVisible = false;
    } catch (err) {
      this.exportError.set(err instanceof Error ? err.message : 'Export failed');
    } finally {
      this.exporting.set(false);
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Invoice[]>('/invoices');
      this.invoices.set(
        data.map((invoice) => ({
          ...invoice,
          total: Number(invoice.total),
        })),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally { this.loading.set(false); }
  }

  getRowActions(invoice: Invoice): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (invoice.status === 'DRAFT') {
      actions.push({
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.router.navigate(['/invoices', invoice.id, 'edit']),
      });
    }
    actions.push({
      id: 'pdf',
      label: 'Download PDF',
      icon: 'pi pi-file-pdf',
      command: () => this.downloadPdf(invoice),
    });
    if (invoice.status === 'DRAFT') {
      actions.push({
        id: 'send',
        label: 'Send',
        icon: 'pi pi-send',
        command: () => this.send(invoice, false),
      });
    } else if (invoice.status === 'SENT' || invoice.status === 'PAID') {
      actions.push({
        id: 'resend',
        label: 'Resend',
        icon: 'pi pi-envelope',
        command: () => this.send(invoice, true),
      });
    }
    if (invoice.status === 'SENT') {
      actions.push({
        id: 'mark-paid',
        label: 'Mark as paid',
        icon: 'pi pi-check',
        command: () => this.markPaid(invoice),
      });
    }
    if (invoice.status === 'SENT') {
      actions.push({
        id: 'retract',
        label: 'Retract',
        icon: 'pi pi-ban',
        command: () => this.confirmRetract(invoice),
      });
    }
    if (this.session.can('invoices', 'delete')) {
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(invoice),
      });
    }
    return actions;
  }

  statusSeverity(status: string): string {
    const map: Record<string, string> = { DRAFT: 'secondary', SENT: 'info', PAID: 'success', VOID: 'danger' };
    return map[status] ?? 'secondary';
  }

  dueFlag(invoice: Invoice) {
    return invoiceDueFlag(invoice.dueDate, invoice.status);
  }

  dueFlagLabel(invoice: Invoice): string | null {
    const flag = this.dueFlag(invoice);
    if (flag === 'overdue') return 'Overdue';
    if (flag === 'due') return 'Due';
    return null;
  }

  dueFlagSeverity(invoice: Invoice): string {
    return this.dueFlag(invoice) === 'overdue' ? 'danger' : 'warn';
  }

  async downloadPdf(invoice: Invoice) {
    try {
      await this.api.downloadPdf(
        `/invoices/${invoice.id}/pdf`,
        `${invoice.displayNumber}.pdf`,
      );
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'PDF download failed'); }
  }

  async send(invoice: Invoice, resend: boolean) {
    this.error.set(null);
    const result = await this.invoiceSendDialog.open({
      invoiceId: invoice.id,
      displayNumber: invoice.displayNumber,
      resend,
    });
    if (result?.sent) {
      await this.load();
      this.toast.add({
        severity: 'success',
        summary: resend ? 'Invoice resent' : 'Invoice sent',
        detail: resend
          ? `${invoice.displayNumber} was emailed to ${result.to} again.`
          : `${invoice.displayNumber} was emailed to ${result.to}.`,
        life: 6000,
      });
    }
  }

  async markPaid(invoice: Invoice) {
    this.error.set(null);
    const result = await this.invoiceMarkPaidDialog.open({
      invoiceId: invoice.id,
      displayNumber: invoice.displayNumber,
      total: invoice.total,
    });
    if (result?.marked) {
      await this.load();
      this.toast.add({
        severity: 'success',
        summary: 'Invoice marked paid',
        detail: `${invoice.displayNumber} was marked paid on ${this.formatDate(result.paidAt)}.`,
        life: 6000,
      });
    }
  }

  confirmRetract(invoice: Invoice) {
    this.deleteConfirm.confirm({
      message: `Retract ${invoice.displayNumber}? It will be voided and linked time and expenses can be invoiced again.`,
      accept: async () => {
        try {
          await this.api.post(`/invoices/${invoice.id}/retract`, {});
          await this.load();
          this.toast.add({
            severity: 'success',
            summary: 'Invoice retracted',
            detail: `${invoice.displayNumber} was voided.`,
            life: 5000,
          });
        } catch (err) {
          this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Retract failed');
        }
      },
    });
  }

  confirmDelete(invoice: Invoice) {
    this.deleteConfirm.confirm({
      message: `Delete invoice ${invoice.displayNumber}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/invoices/${invoice.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatAmount(n: number): string {
    return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
}
