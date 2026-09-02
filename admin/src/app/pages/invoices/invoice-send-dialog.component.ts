import { Component, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import {
  InvoiceSendDialogRequest,
  InvoiceSendDialogService,
} from './invoice-send-dialog.service';

type RecipientType = 'client' | 'project' | 'custom';

type ProjectContact = {
  projectId: string;
  projectName: string;
  email: string;
  contactName: string | null;
};

type SendRecipients = {
  displayNumber: string;
  client: { name: string; email: string | null };
  projectContacts: ProjectContact[];
};

@Component({
  selector: 'app-invoice-send-dialog',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    CopyEmailComponent,
  ],
  styles: `
    .invoice-send-intro {
      margin: 0 0 1rem;
      color: var(--text-color-secondary);
    }
    .invoice-send-client {
      margin: 0 0 1.25rem;
      padding: 0.75rem 1rem;
      border-radius: var(--border-radius);
      background: var(--surface-50);
      border: 1px solid var(--surface-200);
    }
    .invoice-send-client-body {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }
    .invoice-send-client-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      margin-bottom: 0.25rem;
    }
    .invoice-send-options {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .invoice-send-option {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .invoice-send-option-header {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      cursor: pointer;
    }
    .invoice-send-option-header input {
      margin-top: 0.2rem;
    }
    .invoice-send-option-title {
      font-weight: 500;
    }
    .invoice-send-option-detail {
      margin: 0;
      padding-left: 1.5rem;
      color: var(--text-color-secondary);
      font-size: 0.875rem;
    }
    .invoice-send-option-control {
      padding-left: 1.5rem;
      min-width: 0;
    }
    .invoice-send-contact-option {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.35;
      padding: 0.125rem 0;
    }
    .invoice-send-contact-option--selected {
      gap: 0;
    }
    .invoice-send-contact-option-name {
      font-weight: 500;
    }
    .invoice-send-contact-option-email,
    .invoice-send-contact-option-meta,
    .invoice-send-contact-option-project {
      font-size: 0.8125rem;
      color: var(--text-color-secondary);
    }
    :host ::ng-deep .invoice-send-dialog .p-dialog-content {
      overflow-x: hidden;
    }
    :host ::ng-deep .invoice-send-project-select .p-select-label {
      white-space: normal;
    }
    :host ::ng-deep .invoice-send-project-select-panel .p-select-option {
      white-space: normal;
      height: auto;
      align-items: flex-start;
    }
    :host ::ng-deep .invoice-send-project-select-panel .p-select-option-check-icon {
      margin-top: 0.2rem;
    }
  `,
  template: `
    <p-dialog
      [header]="dialogHeader()"
      [(visible)]="visible"
      [modal]="true"
      [closable]="!sending()"
      [style]="{ width: 'min(32rem, 96vw)' }"
      styleClass="invoice-send-dialog"
      (onHide)="onHide()"
    >
      @if (loading()) {
        <p class="text-color-secondary mb-0">Loading recipients…</p>
      } @else if (loadError()) {
        <p-message severity="error" [text]="loadError()!" />
      } @else if (recipients()) {
        <p class="invoice-send-intro text-sm">
          Choose where to email invoice <strong>{{ recipients()!.displayNumber }}</strong>.
        </p>

        <div class="invoice-send-client">
          <span class="invoice-send-client-label">Client</span>
          <div class="invoice-send-client-body">
            <span>{{ recipients()!.client.name }}</span>
            @if (recipients()!.client.email) {
              <app-copy-email [email]="recipients()!.client.email" [muted]="true" />
            } @else {
              <span class="text-color-secondary text-sm">No client email on file</span>
            }
          </div>
        </div>

        <div class="invoice-send-options">
          @if (recipients()!.client.email) {
            <label class="invoice-send-option">
              <span class="invoice-send-option-header">
                <input
                  type="radio"
                  name="invoiceSendRecipient"
                  value="client"
                  [(ngModel)]="recipientType"
                />
                <span>
                  <span class="invoice-send-option-title">Client email</span>
                  <p class="invoice-send-option-detail">
                    <app-copy-email [email]="recipients()!.client.email" [muted]="true" />
                  </p>
                </span>
              </span>
            </label>
          }

          @if (projectContactOptions().length) {
            <div class="invoice-send-option">
              <label class="invoice-send-option-header">
                <input
                  type="radio"
                  name="invoiceSendRecipient"
                  value="project"
                  [(ngModel)]="recipientType"
                />
                <span class="invoice-send-option-title">Project contact</span>
              </label>
              <div class="invoice-send-option-control">
                <p-select
                  inputId="invoiceSendProjectContact"
                  [options]="projectContactOptions()"
                  optionValue="email"
                  [(ngModel)]="selectedContactEmail"
                  [disabled]="recipientType !== 'project'"
                  placeholder="Select project contact"
                  styleClass="w-full invoice-send-project-select"
                  panelStyleClass="invoice-send-project-select-panel"
                  appendTo="body"
                >
                  <ng-template #selectedItem let-option>
                    @if (option) {
                      <div class="invoice-send-contact-option invoice-send-contact-option--selected">
                        <span class="invoice-send-contact-option-name">
                          {{ option.contactName || option.email }}
                        </span>
                        <app-copy-email
                          [email]="option.email"
                          [muted]="true"
                          [block]="true"
                        />
                        <span class="invoice-send-contact-option-project">{{ option.projectName }}</span>
                      </div>
                    }
                  </ng-template>
                  <ng-template #item let-option>
                    <div class="invoice-send-contact-option">
                      <span class="invoice-send-contact-option-name">
                        {{ option.contactName || 'Project contact' }}
                      </span>
                      <app-copy-email
                        [email]="option.email"
                        [muted]="true"
                        [block]="true"
                      />
                      <span class="invoice-send-contact-option-project">{{ option.projectName }}</span>
                    </div>
                  </ng-template>
                </p-select>
              </div>
            </div>
          }

          <div class="invoice-send-option">
            <label class="invoice-send-option-header">
              <input
                type="radio"
                name="invoiceSendRecipient"
                value="custom"
                [(ngModel)]="recipientType"
              />
              <span class="invoice-send-option-title">Other email</span>
            </label>
            <div class="invoice-send-option-control">
              <input
                pInputText
                id="invoiceSendCustomEmail"
                type="email"
                [(ngModel)]="customEmail"
                [disabled]="recipientType !== 'custom'"
                class="w-full"
                placeholder="name@example.com"
              />
            </div>
          </div>
        </div>

        @if (sendError()) {
          <p-message severity="error" [text]="sendError()!" class="mt-3" />
        }
      }

      <ng-template pTemplate="footer">
        <p-button
          label="Cancel"
          severity="secondary"
          [disabled]="sending()"
          (onClick)="cancel()"
        />
        <p-button
          [label]="sendButtonLabel()"
          icon="pi pi-send"
          [loading]="sending()"
          [disabled]="loading() || !!loadError() || !canSend()"
          (onClick)="send()"
        />
      </ng-template>
    </p-dialog>
  `,
})
export class InvoiceSendDialogComponent {
  private readonly api = inject(ApiService);
  private readonly dialogService = inject(InvoiceSendDialogService);

  visible = false;
  loading = signal(false);
  sending = signal(false);
  loadError = signal<string | null>(null);
  sendError = signal<string | null>(null);
  recipients = signal<SendRecipients | null>(null);
  activeRequest = signal<InvoiceSendDialogRequest | null>(null);

  recipientType: RecipientType = 'custom';
  selectedContactEmail = '';
  customEmail = '';

  readonly projectContactOptions = signal<ProjectContact[]>([]);

  constructor() {
    effect(() => {
      const req = this.dialogService.request();
      if (req) {
        void this.open(req);
      }
    });
  }

  dialogHeader(): string {
    return this.activeRequest()?.resend ? 'Resend invoice' : 'Send invoice';
  }

  sendButtonLabel(): string {
    return this.activeRequest()?.resend ? 'Resend' : 'Send';
  }

  canSend(): boolean {
    return this.resolveRecipient() !== null;
  }

  async open(req: InvoiceSendDialogRequest): Promise<void> {
    this.activeRequest.set(req);
    this.visible = true;
    this.loading.set(true);
    this.loadError.set(null);
    this.sendError.set(null);
    this.recipients.set(null);
    this.recipientType = 'custom';
    this.selectedContactEmail = '';
    this.customEmail = '';

    try {
      const data = await this.api.get<SendRecipients>(
        `/invoices/${req.invoiceId}/send-recipients`,
      );
      this.recipients.set(data);
      this.projectContactOptions.set(data.projectContacts);
      this.applyDefaultRecipient(data);
    } catch (err) {
      this.loadError.set(err instanceof Error ? err.message : 'Failed to load recipients');
    } finally {
      this.loading.set(false);
    }
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

  async send(): Promise<void> {
    const req = this.activeRequest();
    const recipient = this.resolveRecipient();
    if (!req || !recipient) return;

    this.sending.set(true);
    this.sendError.set(null);
    try {
      const result = await this.api.post<{ sent: boolean; error?: string }>(
        `/invoices/${req.invoiceId}/send`,
        recipient,
      );
      if (result.sent) {
        this.visible = false;
        this.dialogService.complete({ sent: true, to: recipient.to });
        this.activeRequest.set(null);
      } else {
        this.sendError.set(result.error ?? 'Send failed');
      }
    } catch (err) {
      this.sendError.set(err instanceof Error ? err.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  private applyDefaultRecipient(data: SendRecipients): void {
    if (data.client.email) {
      this.recipientType = 'client';
      return;
    }
    if (data.projectContacts.length >= 1) {
      this.recipientType = 'project';
      this.selectedContactEmail = data.projectContacts[0].email;
      return;
    }
    this.recipientType = 'custom';
  }

  private resolveRecipient(): { to: string; toName?: string } | null {
    const data = this.recipients();
    if (!data) return null;

    if (this.recipientType === 'client') {
      const email = data.client.email?.trim();
      if (!email || !this.isValidEmail(email)) return null;
      return { to: email, toName: data.client.name };
    }

    if (this.recipientType === 'project') {
      const contact = data.projectContacts.find(
        (c) => c.email === this.selectedContactEmail,
      );
      if (!contact || !this.isValidEmail(contact.email)) return null;
      return {
        to: contact.email.trim(),
        toName: contact.contactName ?? undefined,
      };
    }

    const email = this.customEmail.trim();
    if (!this.isValidEmail(email)) return null;
    return { to: email };
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }
}
