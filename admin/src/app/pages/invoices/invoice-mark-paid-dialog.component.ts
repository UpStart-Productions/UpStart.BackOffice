import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ApiService } from '../../core/api.service';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import {
  InvoiceMarkPaidDialogRequest,
  InvoiceMarkPaidDialogService,
} from './invoice-mark-paid-dialog.service';

@Component({
  selector: 'app-invoice-mark-paid-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, MessageModule, DateInputComponent],
  template: `
    <p-dialog
      header="Mark invoice paid"
      [(visible)]="visible"
      [modal]="true"
      [closable]="!saving()"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(32rem, 96vw)' }"
      styleClass="invoice-mark-paid-dialog"
      (onHide)="onHide()"
    >
      @if (activeRequest(); as req) {
        <p class="invoice-mark-paid-intro text-sm text-muted">
          Record payment for <strong>{{ req.displayNumber }}</strong>.
        </p>

        <div class="invoice-mark-paid-form">
          <div class="form-field">
            <label for="markPaidAmount">Amount</label>
            <input
              pInputText
              id="markPaidAmount"
              type="number"
              [(ngModel)]="amountPaid"
              class="w-full"
              step="0.01"
              min="0.01"
            />
          </div>
          <div class="form-field">
            <label for="markPaidDate">Date paid</label>
            <app-date-input inputId="markPaidDate" [(ngModel)]="paidAt" />
          </div>
        </div>

        @if (saveError()) {
          <p-message severity="error" [text]="saveError()!" class="mt-3" />
        }
      }

      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          severity="secondary"
          [text]="true"
          [disabled]="saving()"
          (onClick)="cancel()"
        />
        <p-button
          label="Mark as paid"
          icon="pi pi-check"
          [loading]="saving()"
          [disabled]="!canSave()"
          (onClick)="save()"
        />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .invoice-mark-paid-intro {
      margin: 0 0 1.25rem;
    }

    .invoice-mark-paid-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      min-width: 0;
    }

    :host ::ng-deep .invoice-mark-paid-dialog .p-dialog-content {
      overflow-x: hidden;
    }
  `,
})
export class InvoiceMarkPaidDialogComponent {
  private readonly api = inject(ApiService);
  private readonly dialogService = inject(InvoiceMarkPaidDialogService);

  visible = false;
  saving = signal(false);
  saveError = signal<string | null>(null);
  activeRequest = signal<InvoiceMarkPaidDialogRequest | null>(null);

  amountPaid: number | null = null;
  paidAt = '';

  constructor() {
    effect(() => {
      const req = this.dialogService.request();
      if (req) {
        this.open(req);
      }
    });
  }

  canSave(): boolean {
    return (this.amountPaid ?? 0) > 0 && !!this.paidAt;
  }

  open(req: InvoiceMarkPaidDialogRequest): void {
    this.activeRequest.set(req);
    this.visible = true;
    this.saving.set(false);
    this.saveError.set(null);
    this.amountPaid = req.total;
    this.paidAt = new Date().toISOString().slice(0, 10);
  }

  cancel(): void {
    this.visible = false;
    this.dialogService.complete(null);
  }

  onHide(): void {
    if (this.dialogService.request()) {
      this.dialogService.complete(null);
    }
    this.activeRequest.set(null);
  }

  async save(): Promise<void> {
    const req = this.activeRequest();
    if (!req || !this.canSave()) return;

    this.saving.set(true);
    this.saveError.set(null);
    try {
      await this.api.post(`/invoices/${req.invoiceId}/mark-paid`, {
        amountPaid: this.amountPaid,
        paidAt: this.paidAt,
      });
      this.visible = false;
      this.dialogService.complete({
        marked: true,
        amountPaid: this.amountPaid!,
        paidAt: this.paidAt,
      });
      this.activeRequest.set(null);
    } catch (err) {
      this.saveError.set(err instanceof Error ? err.message : 'Failed to mark invoice as paid');
    } finally {
      this.saving.set(false);
    }
  }
}
