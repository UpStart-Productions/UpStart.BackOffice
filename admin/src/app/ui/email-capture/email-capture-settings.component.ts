import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { CaptureSettings, CommunicationsApi } from '../../core/communications.api';

/** Settings > Email capture: the address to CC and how logging works. */
@Component({
  selector: 'app-email-capture-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    }

    @if (settings(); as s) {
      <div class="email-capture-instructions text-sm mb-3">
        <p class="font-semibold mt-0 mb-2">How to log email</p>
        <ol class="email-capture-steps mb-0">
          <li>CC this address on email you want logged — it lands on the matching client or lead Activity.</li>
          <li>Reply-all keeps the address on the thread.</li>
          <li>Unmatched mail goes to Inbox; file once and the thread follows.</li>
        </ol>
        <p class="mt-2 mb-0 text-color-secondary">
          To log mail without the address on it, reply-all and add the capture address. The Email button on records
          opens your mail app with CC filled in. Only messages this address is on are seen — nothing else in mailboxes
          is read.
        </p>
      </div>

      <div class="showcase-row email-capture-fields-row">
        <div class="form-field showcase-half email-capture-col">
          <label>Capture address</label>
          <p class="text-sm text-color-secondary mt-0 mb-2">
            CC this address on outbound email to log it. Older alias addresses still work if you rename the capture
            name.
          </p>
          @if (s.address) {
            <div class="field-action-row">
              @if (editing) {
                <input
                  pInputText
                  [(ngModel)]="newAlias"
                  class="flex-1 capture-address"
                  aria-label="Capture address name"
                  placeholder="e.g. tpn"
                />
                <span class="capture-address-suffix">&#64;{{ captureDomain(s) }}</span>
                <p-button
                  label="Save"
                  icon="pi pi-check"
                  size="small"
                  [loading]="saving()"
                  [disabled]="!newAlias.trim()"
                  (onClick)="saveAlias()"
                />
                <p-button label="Cancel" severity="secondary" [text]="true" size="small" (onClick)="cancelEdit()" />
              } @else {
                <input pInputText [value]="s.address" readonly class="flex-1 capture-address" aria-label="Capture address" />
                <p-button label="Copy" icon="pi pi-copy" severity="secondary" size="small" (onClick)="copy(s.address)" />
              }
            </div>
            @if (!editing) {
              <button type="button" class="link-btn mt-2" (click)="startEdit(s)">Change the address name</button>
            }
          } @else {
            <p-message severity="warn" class="block mb-0">
              No address yet. It is created automatically when the API starts; reload in a moment.
            </p-message>
          }
          @if (s.aliases.length > 1) {
            <p class="text-sm mt-2 mb-0">
              Older addresses still work:
              @for (a of s.aliases; track a.alias) {
                @if (!a.isPrimary) {
                  <code class="mr-2">{{ a.address || a.alias }}</code>
                }
              }
            </p>
          }
        </div>

        <div class="form-field showcase-half email-capture-col">
          <label for="teamDomains">Your team's email domains</label>
          <p class="text-sm text-color-secondary mt-0 mb-2">
            Addresses at these domains count as your team (your users always do), so they're never treated as clients.
          </p>
          <div class="field-action-row">
            <input
              pInputText
              id="teamDomains"
              [(ngModel)]="domainsText"
              placeholder="e.g. thepurplenest.org"
              class="flex-1"
              aria-label="Team email domains, comma separated"
            />
            <p-button
              label="Save"
              icon="pi pi-check"
              severity="secondary"
              size="small"
              [loading]="savingDomains()"
              (onClick)="saveDomains()"
            />
          </div>
        </div>
      </div>
    } @else if (loading()) {
      <p class="text-color-secondary"><i class="pi pi-spin pi-spinner" aria-hidden="true"></i></p>
    }
  `,
  styles: `
    .capture-address {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .capture-address-suffix {
      flex-shrink: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
    }

    .email-capture-fields-row {
      align-items: start;
    }

    .email-capture-col {
      min-width: 0;
    }

    .email-capture-instructions {
      line-height: 1.5;
    }

    .email-capture-steps {
      margin: 0;
      padding-left: 1.25rem;
    }

    .email-capture-steps li + li {
      margin-top: 0.35rem;
    }
  `,
})
export class EmailCaptureSettingsComponent implements OnInit {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  settings = signal<CaptureSettings | null>(null);
  loading = signal(true);
  saving = signal(false);
  savingDomains = signal(false);
  error = signal<string | null>(null);
  domainsText = '';

  editing = false;
  newAlias = '';

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.apply(await this.comms.captureSettings());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load email capture settings');
    } finally {
      this.loading.set(false);
    }
  }

  captureDomain(s: CaptureSettings): string {
    const fromAddress = s.address?.includes('@') ? s.address.split('@').slice(1).join('@') : '';
    return fromAddress || s.inboundDomain;
  }

  private apply(s: CaptureSettings) {
    this.settings.set(s);
    this.domainsText = s.internalDomains.join(', ');
  }

  startEdit(s: CaptureSettings) {
    this.newAlias = s.primaryAlias ?? s.address?.split('@')[0] ?? '';
    this.editing = true;
  }

  cancelEdit() {
    this.editing = false;
    this.newAlias = '';
  }

  async saveAlias() {
    this.saving.set(true);
    try {
      this.apply(await this.comms.setCaptureAlias(this.newAlias.trim()));
      this.editing = false;
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'New address saved. The old one keeps working.' });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      this.saving.set(false);
    }
  }

  async saveDomains() {
    this.savingDomains.set(true);
    try {
      const domains = this.domainsText.split(/[\s,;]+/).filter(Boolean);
      this.apply(await this.comms.setInternalDomains(domains));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Team domains saved.' });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      this.savingDomains.set(false);
    }
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: text });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy manually.' });
    }
  }
}
