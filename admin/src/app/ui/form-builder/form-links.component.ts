import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CARE_LINK_VERIFY_LABELS, type CareLinkDto, type CareLinkVerify } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

/**
 * Public links for a Care form: new-intake links (form mode, Intake form) or links to one
 * organization's copy (record mode). Each link can need a passcode or an emailed code.
 */
@Component({
  selector: 'app-care-links',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    AppDialogModule,
    HelpTextComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <div class="card-header">
      <h3 class="card-title">{{ recordId() ? 'Share link' : 'Public intake links' }} <app-help-text [key]="recordId() ? 'care.links.record' : 'care.links.intake'" /></h3>
      <p-button label="New link" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openNew()" />
    </div>
    <p-table [value]="links()" [loading]="loading()" styleClass="table-bordered">
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 3rem"></th>
          <th>Link</th>
          <th>Check</th>
          <th>Expires</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-l>
        <tr>
          <td><app-row-actions-menu [items]="rowActions(l)" ariaLabel="Link actions" /></td>
          <td>{{ l.label || (l.clientName ?? 'Link') }}</td>
          <td>{{ verifyLabel(l.verify) }}@if (l.email) { ({{ l.email }}) }</td>
          <td>{{ l.expiresAt ? (l.expiresAt | date: 'MMM d, y') : 'Never' }}</td>
          <td><p-tag [value]="status(l).label" [severity]="status(l).severity" /></td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr><td colspan="5">No links yet.</td></tr>
      </ng-template>
    </p-table>

    <p-dialog header="New link" [(visible)]="dialogVisible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      @if (created(); as c) {
        <div class="form-field">
          <label for="clUrl">Link</label>
          <div class="field-action-row">
            <input pInputText id="clUrl" class="flex-1" [value]="c.url" readonly />
            <p-button label="Copy" icon="pi pi-copy" size="small" severity="secondary" (onClick)="copy(c.url)" />
          </div>
        </div>
        @if (c.verify === 'PASSCODE') {
          <p class="mb-0">Share the passcode separately, for example by phone or text.</p>
        }
        @if (c.verify === 'EMAIL_CODE') {
          <p class="mb-0">{{ c.email ? 'A code is emailed to ' + c.email + ' when the link is opened.' : 'People enter their email and get a code before they can fill in the form.' }}</p>
        }
      } @else {
        <div class="form-field">
          <label for="clLabel">Label</label>
          <input pInputText id="clLabel" class="w-full" [(ngModel)]="label" [placeholder]="recordId() ? 'e.g. For the family' : 'e.g. Website intake'" />
        </div>
        <div class="form-field mt-3">
          <label>Check before opening <app-help-text key="care.links.verify" /></label>
          <p-selectbutton [options]="verifyOptions" optionLabel="label" optionValue="value" [(ngModel)]="verify" [allowEmpty]="false" />
        </div>
        @if (verify === 'PASSCODE') {
          <div class="form-field mt-3">
            <label for="clPasscode">Passcode</label>
            <input pInputText id="clPasscode" class="w-full" [(ngModel)]="passcode" autocomplete="off" />
          </div>
        }
        @if (verify === 'EMAIL_CODE' && recordId()) {
          <div class="form-field mt-3">
            <label for="clEmail">Send the code to</label>
            <input pInputText id="clEmail" type="email" class="w-full" [(ngModel)]="email" placeholder="name@example.com" />
          </div>
        }
        <div class="form-field mt-3">
          <label for="clDays">Expires after (days) <app-help-text key="care.links.expires" /></label>
          <p-inputNumber inputId="clDays" [(ngModel)]="expiresInDays" [min]="0" [max]="3650" [useGrouping]="false" placeholder="Never" styleClass="w-full" inputStyleClass="w-full" />
        </div>
      }
      <ng-template pTemplate="footer">
        @if (created()) {
          <p-button label="Done" (onClick)="dialogVisible = false" />
        } @else {
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="dialogVisible = false" />
          <p-button label="Create link" icon="pi pi-check" [loading]="saving()" [disabled]="!canCreate()" (onClick)="create()" />
        }
      </ng-template>
    </p-dialog>
  `,
})
export class CareLinksComponent {
  private readonly care = inject(CareApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  /** Form mode: new-intake links of this form. */
  formId = input<string | null>(null);
  /** Record mode: links to this organization's copy. */
  recordId = input<string | null>(null);

  readonly verifyOptions = (Object.keys(CARE_LINK_VERIFY_LABELS) as CareLinkVerify[]).map((value) => ({ value, label: CARE_LINK_VERIFY_LABELS[value] }));

  links = signal<CareLinkDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  created = signal<CareLinkDto | null>(null);

  dialogVisible = false;
  label = '';
  verify: CareLinkVerify = 'NONE';
  passcode = '';
  email = '';
  expiresInDays: number | null = null;

  constructor() {
    effect(() => {
      this.formId();
      this.recordId();
      void this.load();
    });
  }

  async load() {
    this.loading.set(true);
    try {
      const rid = this.recordId();
      const fid = this.formId();
      this.links.set(rid ? await this.care.recordLinks(rid) : fid ? await this.care.formLinks(fid) : []);
    } catch {
      this.links.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  verifyLabel(v: CareLinkVerify) {
    return CARE_LINK_VERIFY_LABELS[v];
  }

  status(l: CareLinkDto): { label: string; severity: 'success' | 'secondary' | 'warn' } {
    if (l.revokedAt) return { label: 'Revoked', severity: 'secondary' };
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return { label: 'Expired', severity: 'warn' };
    return { label: 'Active', severity: 'success' };
  }

  rowActions(l: CareLinkDto): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'copy', label: 'Copy link', icon: 'pi pi-copy', command: () => void this.copy(l.url) },
      { id: 'open', label: 'Open', icon: 'pi pi-external-link', command: () => window.open(l.url, '_blank', 'noopener') },
    ];
    if (!l.revokedAt) {
      items.push({ id: 'revoke', label: 'Revoke', icon: 'pi pi-ban', severity: 'danger', command: () => this.confirmRevoke(l) });
    }
    return items;
  }

  openNew() {
    this.created.set(null);
    this.label = '';
    this.verify = 'NONE';
    this.passcode = '';
    this.email = '';
    this.expiresInDays = this.recordId() ? 30 : null;
    this.dialogVisible = true;
  }

  canCreate() {
    if (this.verify === 'PASSCODE' && this.passcode.trim().length < 4) return false;
    if (this.verify === 'EMAIL_CODE' && this.recordId() && !this.email.trim()) return false;
    return true;
  }

  async create() {
    this.saving.set(true);
    try {
      const body = {
        label: this.label.trim() || undefined,
        verify: this.verify,
        passcode: this.verify === 'PASSCODE' ? this.passcode.trim() : undefined,
        email: this.verify === 'EMAIL_CODE' && this.recordId() ? this.email.trim() : undefined,
        expiresInDays: this.expiresInDays ?? 0,
      };
      const rid = this.recordId();
      const link = rid ? await this.care.createRecordLink(rid, body) : await this.care.createFormLink(this.formId()!, body);
      this.created.set(link);
      await this.load();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not create link', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }

  confirmRevoke(l: CareLinkDto) {
    this.confirm.confirm({
      header: 'Revoke link',
      message: 'Revoke this link? It stops working right away and cannot be turned back on.',
      accept: async () => {
        try {
          await this.care.revokeLink(l.id);
          await this.load();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not revoke', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }

  async copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: 'Link copied.' });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy the link manually.' });
    }
  }
}
