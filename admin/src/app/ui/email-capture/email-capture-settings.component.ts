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
      <h4 class="mt-0 mb-2">UBO address</h4>
      @if (s.address) {
        <div class="capture-row">
          <input pInputText [value]="s.address" readonly class="flex-1 capture-address" aria-label="UBO address" />
          <p-button label="Copy" icon="pi pi-copy" severity="secondary" (onClick)="copy(s.address)" />
        </div>
      } @else {
        <p-message severity="warn" class="block mb-2">
          No address yet. It is created automatically when the API starts; reload in a moment.
        </p-message>
      }
      <div class="capture-row mt-2">
        @if (!editing) {
          <button type="button" class="link-btn" (click)="startEdit(s)">Change the address name</button>
        } @else {
          <input pInputText [(ngModel)]="newAlias" placeholder="e.g. tpn" class="flex-1" aria-label="New address name" />
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!newAlias.trim()" (onClick)="saveAlias()" />
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editing = false" />
        }
      </div>
      @if (s.aliases.length > 1) {
        <p class="text-color-secondary text-sm mt-2 mb-0">
          Older addresses still work:
          @for (a of s.aliases; track a.alias) {
            @if (!a.isPrimary) {
              <code class="mr-2">{{ a.address || a.alias }}</code>
            }
          }
        </p>
      }

      <h4 class="mt-4 mb-2">How to log email</h4>
      <ol class="steps">
        <li>
          <span class="step-num" aria-hidden="true">1</span>
          <div><strong>CC this address</strong> on any email you want in UBO. It lands on the matching client's or lead's Activity.</div>
        </li>
        <li>
          <span class="step-num" aria-hidden="true">2</span>
          <div><strong>Reply-all keeps it logged.</strong> Everyone who replies-all, including clients, keeps UBO on the thread.</div>
        </li>
        <li>
          <span class="step-num" aria-hidden="true">3</span>
          <div>Anything UBO can't match goes to the <strong>Inbox</strong>. File it once; the rest of the thread follows, and the people on it are remembered.</div>
        </li>
      </ol>
      <ul class="how">
        <li><strong>Got an email without UBO on it?</strong> Reply-all and add this address. The earlier message is kept in the quoted text.</li>
        <li>The <strong>Email</strong> button on clients, leads and contacts opens your mail app with this address already on CC.</li>
      </ul>
      <p class="text-color-secondary text-sm">
        UBO only sees messages this address is on. Nothing else in anyone's mailbox is read.
      </p>

      <h4 class="mt-4 mb-2">Your team's email domains</h4>
      <p class="text-color-secondary mt-0">
        Addresses at these domains count as your team (your users always do), so they're never
        treated as clients.
      </p>
      <div class="capture-row">
        <input
          pInputText
          [(ngModel)]="domainsText"
          placeholder="e.g. thepurplenest.org"
          class="flex-1"
          aria-label="Team email domains, comma separated"
        />
        <p-button label="Save" icon="pi pi-check" severity="secondary" [loading]="savingDomains()" (onClick)="saveDomains()" />
      </div>
    } @else if (loading()) {
      <p class="text-color-secondary">Loading…</p>
    }
  `,
  styles: `
    .capture-row { display: flex; align-items: center; gap: 0.5rem; }
    .how { padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; margin: 0 0 0.75rem; }
    .capture-address { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .steps { list-style: none; padding: 0; margin: 0 0 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
    .steps li { display: flex; gap: 0.75rem; align-items: flex-start; }
    .step-num { flex: 0 0 1.5rem; height: 1.5rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; font-weight: 600; color: var(--brand-primary); background: color-mix(in srgb, var(--brand-primary) 14%, transparent); }
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

  private apply(s: CaptureSettings) {
    this.settings.set(s);
    this.domainsText = s.internalDomains.join(', ');
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

  startEdit(s: CaptureSettings) {
    this.newAlias = s.primaryAlias ?? '';
    this.editing = true;
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

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: text });
    } catch {
      this.toast.add({ severity: 'warn', summary: 'Copy failed', detail: 'Select and copy it manually.' });
    }
  }
}
