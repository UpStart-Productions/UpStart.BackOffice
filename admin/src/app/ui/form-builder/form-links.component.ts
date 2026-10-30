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
import { TooltipModule } from 'primeng/tooltip';
import { FORM_LINK_VERIFY_LABELS, normalizeOrigins, type FormLinkDto, type FormLinkVerify } from '@upstart/back-office/shared';
import { TextareaModule } from 'primeng/textarea';
import { environment } from '../../../environments/environment';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

/**
 * The one public-links panel for any form: new-response links (form mode) or links to one organization's
 * response (record mode, Care). Each link can need a passcode or an emailed code. `apiBase` is the owning
 * module's API (e.g. "/care", "/form-admin"), which serves {apiBase}/forms/:id/links, {apiBase}/records/:id/links
 * and {apiBase}/links/:id/revoke.
 */
@Component({
  selector: 'app-form-links',
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
    TextareaModule,
    TooltipModule,
    AppDialogModule,
    HelpTextComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <div class="card-header">
      <h3 class="card-title">{{ title() || (recordId() ? 'Share link' : 'Public links') }} @if (helpKey()) {<app-help-text [key]="helpKey()!" />}</h3>
      <p-button label="New link" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openNew()" />
    </div>
    @if (compact()) {
      <!-- A side panel: one small row per link instead of the table. -->
      <div class="side-list">
        @for (l of links(); track l.id) {
          <div class="side-list-row">
            <div class="side-list-body">
              <span class="side-list-title">{{ l.label || (l.clientName ?? 'Link') }}</span>
              <span class="side-list-detail">{{ verifyLabel(l.verify) }}@if (l.email) { to {{ l.email }}}</span>
              <span class="side-list-detail">{{ l.expiresAt ? 'Expires ' + (l.expiresAt | date: 'MMM d, y') : 'No expiry' }}</span>
            </div>
            @if (status(l).label !== 'Active') {
              <p-tag [value]="status(l).label" [severity]="status(l).severity" />
            }
            @if (status(l).label === 'Active') {
              <p-button icon="pi pi-copy" [text]="true" [rounded]="true" severity="secondary" size="small" ariaLabel="Copy link" pTooltip="Copy link" tooltipPosition="top" (onClick)="copy(l.url)" />
            }
            <app-row-actions-menu [items]="rowActions(l)" ariaLabel="Link actions" />
          </div>
        } @empty {
          <p class="m-0 text-color-secondary">{{ loading() ? 'Loading…' : 'No links yet. New link makes one to send, for example to family.' }}</p>
        }
      </div>
    } @else {
    <p-table [value]="links()" [loading]="loading()" styleClass="table-bordered">
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 3rem"></th>
          <th>Link</th>
          <th>Check</th>
          <th>Expires</th>
          <th>Websites</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-l>
        <tr>
          <td><app-row-actions-menu [items]="rowActions(l)" ariaLabel="Link actions" /></td>
          <td>{{ l.label || (l.clientName ?? 'Link') }}</td>
          <td>{{ verifyLabel(l.verify) }}@if (l.email) { ({{ l.email }}) }</td>
          <td>{{ l.expiresAt ? (l.expiresAt | date: 'MMM d, y') : 'Never' }}</td>
          <td>{{ l.allowedOrigins.length ? l.allowedOrigins.join(', ') : 'Any' }}</td>
          <td><p-tag [value]="status(l).label" [severity]="status(l).severity" /></td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr><td colspan="6">No links yet.</td></tr>
      </ng-template>
    </p-table>
    }

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
          <input pInputText id="clLabel" class="w-full" [(ngModel)]="label" [placeholder]="recordId() ? 'e.g. For the family' : 'e.g. Website'" />
        </div>
        <div class="form-field mt-3">
          <label>Check before opening <app-help-text key="form.links.verify" /></label>
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
        @if (!recordId()) {
          <div class="form-field mt-3">
            <label for="clSites">Allowed websites <app-help-text key="form.links.websites" /></label>
            <textarea pTextarea id="clSites" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="websites" placeholder="Any website. Or list them, e.g. example.org"></textarea>
          </div>
        }
        <div class="form-field mt-3">
          <label for="clDays">Expires after (days) <app-help-text key="form.links.expires" /></label>
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

    <p-dialog header="Embed on a website" [(visible)]="embedVisible" [modal]="true" [style]="{ width: 'min(40rem, 96vw)' }">
      @if (embedLink(); as e) {
        <p class="mt-0">Paste this where the form should appear on any website. The form uses the website's own fonts and colors.</p>
        <div class="form-field">
          <label for="clEmbed">Embed code</label>
          <textarea pTextarea id="clEmbed" class="w-full embed-code" rows="3" [value]="embedCode(e)" readonly></textarea>
        </div>
        <div class="form-field mt-3">
          <label for="clLinkToken">Link key (for websites that draw the form themselves) <app-help-text key="form.links.token" /></label>
          <div class="field-action-row">
            <input pInputText id="clLinkToken" class="flex-1" [value]="tokenOf(e)" readonly />
            <p-button label="Copy" icon="pi pi-copy" size="small" severity="secondary" (onClick)="copy(tokenOf(e))" />
          </div>
        </div>
        <div class="form-field mt-3">
          <label for="clEditSites">Allowed websites <app-help-text key="form.links.websites" /></label>
          <textarea pTextarea id="clEditSites" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="websites" placeholder="Any website. Or list them, e.g. example.org"></textarea>
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Close" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="embedVisible = false" />
        <p-button label="Copy embed code" icon="pi pi-copy" severity="secondary" [outlined]="true" (onClick)="copy(embedCode(embedLink()!))" />
        <p-button label="Save websites" icon="pi pi-check" [loading]="saving()" (onClick)="saveWebsites()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .embed-code {
      font-family: monospace;
    }
  `,
})
export class FormLinksComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  /** The owning module's API, e.g. "/care". */
  apiBase = input.required<string>();
  title = input<string | null>(null);
  helpKey = input<string | null>(null);
  /** Form mode: new-response links of this form. */
  formId = input<string | null>(null);
  /** Record mode: links to this organization's copy. */
  recordId = input<string | null>(null);
  /** For a narrow side panel: a short list instead of the table. */
  compact = input(false);

  readonly verifyOptions = (Object.keys(FORM_LINK_VERIFY_LABELS) as FormLinkVerify[]).map((value) => ({ value, label: FORM_LINK_VERIFY_LABELS[value] }));

  links = signal<FormLinkDto[]>([]);
  loading = signal(true);
  saving = signal(false);
  created = signal<FormLinkDto | null>(null);

  dialogVisible = false;
  label = '';
  verify: FormLinkVerify = 'NONE';
  passcode = '';
  email = '';
  expiresInDays: number | null = null;
  websites = '';
  embedVisible = false;
  embedLink = signal<FormLinkDto | null>(null);

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
      const base = this.apiBase();
      this.links.set(
        rid ? await this.api.get<FormLinkDto[]>(`${base}/records/${rid}/links`) : fid ? await this.api.get<FormLinkDto[]>(`${base}/forms/${fid}/links`) : [],
      );
    } catch {
      this.links.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  verifyLabel(v: FormLinkVerify) {
    return FORM_LINK_VERIFY_LABELS[v];
  }

  status(l: FormLinkDto): { label: string; severity: 'success' | 'secondary' | 'warn' } {
    if (l.revokedAt) return { label: 'Revoked', severity: 'secondary' };
    if (l.expiresAt && new Date(l.expiresAt) < new Date()) return { label: 'Expired', severity: 'warn' };
    return { label: 'Active', severity: 'success' };
  }

  rowActions(l: FormLinkDto): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'copy', label: 'Copy link', icon: 'pi pi-copy', command: () => void this.copy(l.url) },
      { id: 'open', label: 'Open', icon: 'pi pi-external-link', command: () => window.open(l.url, '_blank', 'noopener') },
    ];
    if (l.kind === 'NEW' && !l.revokedAt) {
      items.push({ id: 'embed', label: 'Embed on a website', icon: 'pi pi-code', command: () => this.openEmbed(l) });
    }
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
    this.websites = '';
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
        ...(this.recordId() ? {} : { allowedOrigins: normalizeOrigins(this.websites) }),
      };
      const rid = this.recordId();
      const base = this.apiBase();
      const link = await this.api.post<FormLinkDto>(rid ? `${base}/records/${rid}/links` : `${base}/forms/${this.formId()}/links`, body);
      this.created.set(link);
      await this.load();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not create link', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }

  confirmRevoke(l: FormLinkDto) {
    this.confirm.confirm({
      header: 'Revoke link',
      message: 'Revoke this link? It stops working right away and cannot be turned back on.',
      accept: async () => {
        try {
          await this.api.post<FormLinkDto>(`${this.apiBase()}/links/${l.id}/revoke`, {});
          await this.load();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not revoke', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }

  /** The link's key: the last part of its URL. */
  tokenOf(l: FormLinkDto) {
    return l.url.split('/').pop() ?? '';
  }

  embedCode(l: FormLinkDto) {
    const api = new URL(environment.apiBaseUrl, window.location.origin).href.replace(/\/$/, '');
    return `<script src="${api}/form-embed.js" data-ubo-form="${this.tokenOf(l)}" async></script>`;
  }

  openEmbed(l: FormLinkDto) {
    this.embedLink.set(l);
    this.websites = l.allowedOrigins.join('\n');
    this.embedVisible = true;
  }

  async saveWebsites() {
    const l = this.embedLink();
    if (!l) return;
    this.saving.set(true);
    try {
      const updated = await this.api.patch<FormLinkDto>(`${this.apiBase()}/links/${l.id}`, { allowedOrigins: normalizeOrigins(this.websites) });
      this.embedLink.set(updated);
      this.websites = updated.allowedOrigins.join('\n');
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Saved', detail: updated.allowedOrigins.length ? 'Only the listed websites can show this form.' : 'Any website can show this form.' });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.saving.set(false);
    }
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
