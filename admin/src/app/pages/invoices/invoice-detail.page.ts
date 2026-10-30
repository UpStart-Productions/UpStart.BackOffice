import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import type { RecordAttributionDto } from '@upstart/back-office/shared';
import { FileViewerDialogComponent, type ViewerFile } from '../../ui/file-viewer/file-viewer-dialog.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { InvoiceSendDialogService } from './invoice-send-dialog.service';
import { InvoiceMarkPaidDialogService } from './invoice-mark-paid-dialog.service';
import { invoiceDueFlag } from './invoice-status.util';

type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
};

type InvoiceDetail = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  paidAt?: string | null;
  amountPaid?: number | null;
  billTo?: 'CLIENT' | 'TENANT';
  billToName?: string | null;
  billToEmail?: string | null;
  billToAddress?: string | null;
  notes?: string | null;
  client: { id: string; name: string } | null;
  lineItems: InvoiceLineItem[];
  attribution?: RecordAttributionDto | null;
};

type OrganizationLetterhead = {
  companyName: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
};

@Component({
  selector: 'app-invoice-detail-page',
  standalone: true,
  imports: [ButtonModule, MessageModule, TableModule, TagModule, RouterLink, PageComponent, FileViewerDialogComponent, RecordAttributionComponent],
  templateUrl: './invoice-detail.page.html',
  styleUrl: './invoice-detail.page.scss',
})
export class InvoiceDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly invoiceSendDialog = inject(InvoiceSendDialogService);
  private readonly invoiceMarkPaidDialog = inject(InvoiceMarkPaidDialogService);

  loading = signal(true);
  error = signal<string | null>(null);
  invoice = signal<InvoiceDetail | null>(null);
  readonly attribution = signal<RecordAttributionDto | null>(null);
  readonly letterhead = signal<OrganizationLetterhead | null>(null);

  pdfViewer = signal<ViewerFile | null>(null);

  readonly orgLogoUrl = computed(() => resolveLogoAssetUrl(this.letterhead()?.logoUrl));

  get canResend(): boolean {
    const s = this.invoice()?.status;
    return s === 'SENT' || s === 'PAID';
  }

  get canMarkPaid(): boolean {
    return this.invoice()?.status === 'SENT';
  }

  get showProjectColumn(): boolean {
    const items = this.invoice()?.lineItems ?? [];
    return items.some((li) => li.projectId || li.project?.name);
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/invoices']);
      return;
    }

    try {
      const [inv, branding] = await Promise.all([
        this.api.get<InvoiceDetail>(`/invoices/${id}`),
        this.api.get<OrganizationLetterhead>('/organization-profile/branding').catch(() => null),
      ]);
      if (inv.status === 'DRAFT') {
        await this.router.navigate(['/invoices', id, 'edit']);
        return;
      }
      this.letterhead.set(branding);
      this.applyInvoice(inv);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      this.loading.set(false);
    }
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

  statusLabel(inv: InvoiceDetail): string {
    if (inv.status === 'PAID' && inv.paidAt) {
      return `PAID ${this.formatDate(inv.paidAt)}`;
    }
    return inv.status;
  }

  dueFlag(inv: InvoiceDetail) {
    return invoiceDueFlag(inv.dueDate, inv.status);
  }

  dueFlagLabel(inv: InvoiceDetail): string | null {
    const flag = this.dueFlag(inv);
    if (flag === 'overdue') return 'Overdue';
    if (flag === 'due') return 'Due';
    return null;
  }

  dueFlagSeverity(inv: InvoiceDetail): string {
    return this.dueFlag(inv) === 'overdue' ? 'danger' : 'warn';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatIssueDateLong(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  formatAmount(n: number): string {
    return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  notesHtml(notes: string | null | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(notes ?? '');
  }

  orgAddressLines(): string[] {
    const p = this.letterhead();
    if (!p) return [];
    const cityLine =
      p.city && p.state
        ? `${p.city}, ${p.state} ${p.zip ?? ''}`.trim()
        : [p.city, p.state, p.zip].filter(Boolean).join(' ');
    return [p.address, cityLine, p.phone].map((part) => part?.trim()).filter(Boolean) as string[];
  }

  billToAddressLines(inv: InvoiceDetail): string[] {
    if (!inv.billToAddress?.trim()) return [];
    return inv.billToAddress.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }

  /** The stored PDF in the shared viewer (the same window as task attachments). */
  viewPdf() {
    const inv = this.invoice();
    if (!inv) return;
    this.pdfViewer.set({
      name: `${inv.displayNumber}.pdf`,
      kind: 'pdf',
      loadBlob: () => this.api.fetchPdfBlob(`/invoices/${inv.id}/pdf`),
      download: () => this.api.downloadPdf(`/invoices/${inv.id}/pdf`, `${inv.displayNumber}.pdf`),
    });
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

  async markPaid() {
    const inv = this.invoice();
    if (!inv) return;

    const result = await this.invoiceMarkPaidDialog.open({
      invoiceId: inv.id,
      displayNumber: inv.displayNumber,
      total: inv.total,
    });
    if (result?.marked) {
      const updated = await this.api.get<InvoiceDetail>(`/invoices/${inv.id}`);
      this.applyInvoice(updated);
      this.toast.add({
        severity: 'success',
        summary: 'Invoice marked paid',
        detail: `${inv.displayNumber} was marked paid on ${this.formatDate(result.paidAt)}.`,
        life: 6000,
      });
    }
  }

  private applyInvoice(inv: InvoiceDetail) {
    this.invoice.set({
      ...inv,
      subtotal: Number(inv.subtotal),
      taxRate: inv.taxRate != null ? Number(inv.taxRate) : null,
      taxAmount: inv.taxAmount != null ? Number(inv.taxAmount) : null,
      total: Number(inv.total),
      amountPaid: inv.amountPaid != null ? Number(inv.amountPaid) : null,
      lineItems: (inv.lineItems ?? []).map((li) => ({
        ...li,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        amount: Number(li.amount),
      })),
    });
    this.attribution.set(inv.attribution ?? null);
  }
}

function resolveLogoAssetUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const resolved = resolveAssetUrl(raw);
  if (resolved) return resolved;
  if (!raw.startsWith('/') && !raw.startsWith('http')) {
    return resolveAssetUrl(`/api/uploads/${raw.replace(/\\/g, '/')}`);
  }
  return null;
}
