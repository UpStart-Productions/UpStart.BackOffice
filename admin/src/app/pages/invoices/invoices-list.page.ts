import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';

type Invoice = {
  id: string; displayNumber: string; status: string;
  issueDate: string; dueDate?: string; total: number;
  client: { id: string; name: string };
};

@Component({
  selector: 'app-invoices-list-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    TableModule,
    MessageModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './invoices-list.page.html',
})
export class InvoicesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);

  invoices = signal<Invoice[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Invoice[]>('/invoices');
      this.invoices.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally { this.loading.set(false); }
  }

  getRowActions(invoice: Invoice): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        id: 'pdf',
        label: 'Download PDF',
        icon: 'pi pi-file-pdf',
        command: () => this.downloadPdf(invoice),
      },
    ];
    if (invoice.status === 'DRAFT') {
      actions.push({
        id: 'send',
        label: 'Send to client',
        icon: 'pi pi-send',
        command: () => this.send(invoice, false),
      });
    } else if (invoice.status === 'SENT' || invoice.status === 'PAID') {
      actions.push({
        id: 'resend',
        label: 'Resend to client',
        icon: 'pi pi-replay',
        command: () => this.send(invoice, true),
      });
    }
    if (invoice.status === 'DRAFT') {
      actions.push({
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.router.navigate(['/invoices', invoice.id, 'edit']),
      });
    }
    actions.push(
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(invoice),
      },
    );
    return actions;
  }

  statusSeverity(status: string): string {
    const map: Record<string, string> = { DRAFT: 'secondary', SENT: 'info', PAID: 'success', VOID: 'danger' };
    return map[status] ?? 'secondary';
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
