import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import { PageComponent } from '../../ui/layout/page.component';

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
    ConfirmDialogModule,
    TagModule,
    TooltipModule,
    PageComponent,
  ],
  providers: [ConfirmationService],
  templateUrl: './invoices-list.page.html',
})
export class InvoicesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly confirm = inject(ConfirmationService);

  invoices = signal<Invoice[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Invoice[]>(`/workspaces/${this.auth.workspaceSlug}/invoices`);
      this.invoices.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally { this.loading.set(false); }
  }

  statusSeverity(status: string): string {
    const map: Record<string, string> = { DRAFT: 'secondary', SENT: 'info', PAID: 'success', VOID: 'danger' };
    return map[status] ?? 'secondary';
  }

  async downloadPdf(invoice: Invoice) {
    try {
      await this.api.downloadPdf(
        `/workspaces/${this.auth.workspaceSlug}/invoices/${invoice.id}/pdf`,
        `${invoice.displayNumber}.pdf`,
      );
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'PDF download failed'); }
  }

  async send(invoice: Invoice) {
    try {
      const result = await this.api.post<{ sent: boolean; error?: string }>(
        `/workspaces/${this.auth.workspaceSlug}/invoices/${invoice.id}/send`,
      );
      if (result.sent) await this.load();
      else this.error.set(result.error ?? 'Send failed');
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'Send failed'); }
  }

  confirmDelete(invoice: Invoice) {
    this.confirm.confirm({
      message: `Delete invoice ${invoice.displayNumber}?`,
      accept: async () => {
        try {
          await this.api.delete(`/workspaces/${this.auth.workspaceSlug}/invoices/${invoice.id}`);
          await this.load();
        } catch (err) { this.error.set(err instanceof Error ? err.message : 'Delete failed'); }
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
