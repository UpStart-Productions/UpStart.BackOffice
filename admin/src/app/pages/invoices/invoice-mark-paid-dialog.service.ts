import { Injectable, signal } from '@angular/core';

export type InvoiceMarkPaidDialogRequest = {
  invoiceId: string;
  displayNumber: string;
  total: number;
};

export type InvoiceMarkPaidDialogResult = {
  marked: boolean;
  amountPaid: number;
  paidAt: string;
};

@Injectable({ providedIn: 'root' })
export class InvoiceMarkPaidDialogService {
  readonly request = signal<InvoiceMarkPaidDialogRequest | null>(null);

  private resolve: ((result: InvoiceMarkPaidDialogResult | null) => void) | null = null;

  open(req: InvoiceMarkPaidDialogRequest): Promise<InvoiceMarkPaidDialogResult | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.request.set(req);
    });
  }

  complete(result: InvoiceMarkPaidDialogResult | null): void {
    this.request.set(null);
    this.resolve?.(result);
    this.resolve = null;
  }
}
