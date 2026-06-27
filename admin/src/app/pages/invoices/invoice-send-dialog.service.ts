import { Injectable, signal } from '@angular/core';

export type InvoiceSendDialogRequest = {
  invoiceId: string;
  displayNumber: string;
  resend: boolean;
};

export type InvoiceSendDialogResult = {
  sent: boolean;
  to: string;
};

@Injectable({ providedIn: 'root' })
export class InvoiceSendDialogService {
  readonly request = signal<InvoiceSendDialogRequest | null>(null);

  private resolve: ((result: InvoiceSendDialogResult | null) => void) | null = null;

  open(req: InvoiceSendDialogRequest): Promise<InvoiceSendDialogResult | null> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.request.set(req);
    });
  }

  complete(result: InvoiceSendDialogResult | null): void {
    this.request.set(null);
    this.resolve?.(result);
    this.resolve = null;
  }
}
