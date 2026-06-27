import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';

type InvoiceDetail = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  taxAmount?: number | null;
  total: number;
  client: { id: string; name: string };
};

@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, MessageModule, TagModule, PageComponent],
  templateUrl: './invoice-detail.page.html',
  styleUrl: './invoice-detail.page.scss',
})
export class InvoiceDetailPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);

  loading = signal(true);
  error = signal<string | null>(null);
  invoice = signal<InvoiceDetail | null>(null);
  pdfUrl = signal<SafeResourceUrl | null>(null);

  private blobUrl: string | null = null;

  get canResend(): boolean {
    const s = this.invoice()?.status;
    return s === 'SENT' || s === 'PAID';
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/invoices']);
      return;
    }

    try {
      const inv = await this.api.get<InvoiceDetail>(`/invoices/${id}`);
      if (inv.status === 'DRAFT') {
        await this.router.navigate(['/invoices', id, 'edit']);
        return;
      }
      this.invoice.set({
        ...inv,
        subtotal: Number(inv.subtotal),
        taxAmount: inv.taxAmount != null ? Number(inv.taxAmount) : null,
        total: Number(inv.total),
      });

      const blob = await this.api.fetchPdfBlob(`/invoices/${id}/pdf`);
      this.revokeBlob();
      this.blobUrl = URL.createObjectURL(blob);
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    this.revokeBlob();
  }

  statusSeverity(status: string): string {
    const map: Record<string, string> = {
      DRAFT: 'secondary',
      SENT: 'info',
      PAID: 'success',
      VOID: 'danger',
    };
    return map[status] ?? 'secondary';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatAmount(n: number): string {
    return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  async downloadPdf() {
    const inv = this.invoice();
    if (!inv) return;
    try {
      await this.api.downloadPdf(`/invoices/${inv.id}/pdf`, `${inv.displayNumber}.pdf`);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'PDF download failed');
    }
  }

  async resend() {
    const inv = this.invoice();
    if (!inv) return;

    const result = await this.invoiceSendDialog.open({
      invoiceId: inv.id,
      displayNumber: inv.displayNumber,
      resend: true,
    });
    if (result?.sent) {
      this.toast.add({
        severity: 'success',
        summary: 'Invoice resent',
        detail: `${inv.displayNumber} was emailed to ${result.to} again.`,
        life: 6000,
      });
    }
  }

  private revokeBlob() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }
}
