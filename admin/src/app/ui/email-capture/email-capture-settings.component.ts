import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { CaptureSettings, CommunicationsApi } from '../../core/communications.api';
import { HelpTextComponent } from '../help-text/help-text.component';

/** Settings > Email capture: the address to CC and how logging works. */
@Component({
  selector: 'app-email-capture-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule, HelpTextComponent],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    }

    @if (settings(); as s) {
      <h4 class="mt-0 mb-2">Capture address <app-help-text key="emailCapture.address" /></h4>
      @if (s.address) {
        <div class="capture-row">
          <input pInputText [value]="s.address" readonly class="flex-1 capture-address" aria-label="Capture address" />
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
        <p class="text-sm mt-2 mb-0">
          Older addresses still work:
          @for (a of s.aliases; track a.alias) {
            @if (!a.isPrimary) {
              <code class="mr-2">{{ a.address || a.alias }}</code>
            }
          }
        </p>
      }

      <h4 class="mt-4 mb-2">How to log email <app-help-text key="emailCapture.howToLog" /></h4>

      <h4 class="mt-4 mb-2">Your team's email domains <app-help-text key="emailCapture.teamDomains" /></h4>
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
    .capture-address { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
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
