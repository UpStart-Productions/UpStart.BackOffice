import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { formatCurrency } from '@upstart/back-office/shared';
import { invoiceDueFlag } from '../../pages/invoices/invoice-status.util';
import { RecordCardBadge, RecordCardComponent, RecordCardDetail } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

export type InvoiceCardData = {
  id: string;
  displayNumber: string;
  status: string;
  total: number;
  amountPaid?: number | null;
  issueDate?: string | null;
  dueDate?: string | null;
  sentAt?: string | null;
  client?: { name: string } | null;
};

const STATUS: Record<string, RecordCardBadge> = {
  DRAFT: { label: 'Draft', severity: 'secondary' },
  SENT: { label: 'Sent', severity: 'info' },
  PAID: { label: 'Paid', severity: 'success' },
  VOID: { label: 'Void', severity: 'danger' },
};
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** An invoice as the standard record card. Status colors match the Invoices list. */
@Component({
  selector: 'app-invoice-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent],
  template: `
    <app-record-card
      [variant]="variant()"
      icon="receipt"
      [title]="invoice().displayNumber"
      [link]="['/invoices', invoice().id]"
      [linkQuery]="{ from: router.url }"
      [subtitle]="subtitle()"
      [badges]="badges()"
      [details]="details()"
      [actions]="actions()"
    >${RECORD_CARD_SLOTS}</app-record-card>
  `,
})
export class InvoiceCardComponent extends RecordCardWrapper {
  /** The invoice page's back arrow returns to the page this card was on. */
  readonly router = inject(Router);
  invoice = input.required<InvoiceCardData>();

  readonly due = computed(() => Math.max(0, (this.invoice().total ?? 0) - (this.invoice().amountPaid ?? 0)));
  readonly badges = computed<RecordCardBadge[]>(() => {
    const i = this.invoice();
    const out: RecordCardBadge[] = [STATUS[i.status] ?? { label: i.status, severity: 'secondary' }];
    if (invoiceDueFlag(i.dueDate, i.status) === 'overdue') out.push({ label: 'Overdue', severity: 'danger' });
    return [...out, ...this.extraBadges()];
  });
  readonly subtitle = computed(() => {
    if (this.subtitleOverride()) return this.subtitleOverride();
    const i = this.invoice();
    if (this.variant() === 'card') return i.client?.name ?? null;
    return i.status === 'PAID' ? formatCurrency(i.total) : `${formatCurrency(this.due())} due${i.dueDate ? ` ${day(i.dueDate)}` : ''}`;
  });
  readonly details = computed<RecordCardDetail[]>(() => {
    const i = this.invoice();
    const out: RecordCardDetail[] = [
      { icon: 'banknote', text: i.status === 'PAID' ? `${formatCurrency(i.total)} paid` : `${formatCurrency(this.due())} of ${formatCurrency(i.total)} due` },
    ];
    const dates = [i.sentAt ? `Sent ${day(i.sentAt)}` : i.issueDate ? `Issued ${day(i.issueDate)}` : '', i.dueDate ? `due ${day(i.dueDate)}` : '']
      .filter(Boolean)
      .join(' · ');
    if (dates) out.push({ icon: 'calendar', text: dates });
    return out;
  });
}
