import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { CaptureSettings, CommunicationsApi } from '../../core/communications.api';

/** Settings > Email capture: the address to forward to, Gmail setup steps and confirmation codes. */
@Component({
  selector: 'app-email-capture-settings',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule, MessageModule, TagModule],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    }

    @if (settings(); as s) {
      <p class="text-color-secondary mt-0 mb-3">
        Forward client email to one address and it lands on the right client's Activity timeline. Anything we
        can't match goes to the Inbox for you to file.
      </p>

      <h4 class="mt-0 mb-2">Your capture address</h4>
      @if (s.address) {
        <div class="capture-row">
          <input pInputText [value]="s.address" readonly class="flex-1" aria-label="Capture address" />
          <p-button label="Copy" icon="pi pi-copy" severity="secondary" (onClick)="copy(s.address)" />
        </div>
      } @else {
        <p-message severity="warn" class="block mb-2">
          Inbound email isn't set up on this server yet, so there is no address to give out. Your alias is
          <strong>{{ s.primaryAlias || '—' }}</strong>; the address will be
          <code>{{ s.primaryAlias || 'alias' }}&#64;your-inbound-domain</code> once
          <code>INBOUND_EMAIL_DOMAIN</code> is set (see docs/inbound-email-setup.md).
        </p-message>
      }

      <div class="capture-row mt-2">
        @if (!editing) {
          <button type="button" class="link-btn" (click)="startEdit(s)">Change the address name</button>
        } @else {
          <input pInputText [(ngModel)]="newAlias" placeholder="e.g. tpn" class="flex-1" aria-label="New alias" />
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

      <h4 class="mt-4 mb-2">Connect a Gmail account</h4>
      <p class="text-color-secondary mt-0">Each person on the team does this once for their own Gmail.</p>
      <ol class="steps">
        <li>
          <strong>Add the forwarding address.</strong>
          In Gmail open <em>Settings (gear) &rarr; See all settings &rarr; Forwarding and POP/IMAP &rarr; Add a
          forwarding address</em> and enter the capture address above.
        </li>
        <li>
          <strong>Confirm it.</strong>
          Google sends a confirmation code to that address. It shows up below within a minute or two. Enter it
          in Gmail and click <em>Verify</em>.
        </li>
        <li>
          <strong>Create a filter for client mail.</strong>
          <em>Settings &rarr; Filters and Blocked Addresses &rarr; Create a new filter.</em> In
          <em>Has the words</em> list your clients, for example
          <code>from:(&#64;clientorg.com OR jane&#64;example.com)</code>. Click <em>Create filter</em>, tick
          <em>Forward it to</em> and choose the capture address.
        </li>
        <li>
          <strong>Capture what you send, too.</strong>
          Gmail filters only see <em>incoming</em> mail. For replies and outgoing mail, Bcc the capture address.
          Google Workspace admins can add a routing rule that Bccs outgoing mail to it automatically.
        </li>
      </ol>
      <p class="text-color-secondary text-sm">
        Only messages with at least one person outside your team are kept; mail between teammates is ignored.
        Everything forwarded is visible to your team in UBO, so keep personal mail out of the filter.
      </p>

      <div class="capture-head">
        <h4 class="mt-4 mb-2">Gmail confirmation codes</h4>
        <p-button icon="pi pi-refresh" label="Refresh" severity="secondary" [text]="true" size="small" [loading]="loading()" (onClick)="load()" />
      </div>
      @if (s.verifications.length === 0) {
        <p class="text-color-secondary mt-0">
          Nothing yet. After step 1, the confirmation email appears here.
        </p>
      } @else {
        <ul class="codes">
          @for (v of s.verifications; track v.id) {
            <li>
              <span>{{ v.gmailAddress || 'Unknown Gmail address' }}</span>
              @if (v.code) {
                <code class="code">{{ v.code }}</code>
                <button type="button" class="link-btn" (click)="copy(v.code)">Copy</button>
              } @else {
                <p-tag value="Couldn't read the code" severity="warn" />
              }
              @if (v.link) {
                <a [href]="v.link" target="_blank" rel="noopener noreferrer" class="link-btn">Open confirmation link</a>
              }
              <span class="text-color-secondary text-sm">{{ v.receivedAt | date: 'MMM d, h:mm a' }}</span>
            </li>
          }
        </ul>
      }

      <h4 class="mt-4 mb-2">Who counts as your team</h4>
      @if (s.internalDomains.length) {
        <p class="mt-0">
          Mail between these domains and your staff accounts is treated as internal:
          @for (d of s.internalDomains; track d) {
            <code class="mr-2">{{ d }}</code>
          }
        </p>
      } @else {
        <p class="text-color-secondary mt-0">
          Only staff accounts' email addresses count as your team. To include other addresses, set
          <code>INTERNAL_EMAIL_DOMAINS</code> on the server.
        </p>
      }
    } @else if (loading()) {
      <p class="text-color-secondary">Loading…</p>
    }
  `,
  styles: `
    .capture-row { display: flex; align-items: center; gap: 0.5rem; }
    .capture-head { display: flex; align-items: center; justify-content: space-between; }
    .steps { padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem; margin: 0 0 1rem; }
    .codes { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .codes li { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
    .code { font-size: 1.1rem; letter-spacing: 0.1em; }
    .link-btn { background: none; border: 0; padding: 0; cursor: pointer; color: var(--primary-color, #2563eb); font-size: 0.9rem; }
  `,
})
export class EmailCaptureSettingsComponent implements OnInit {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  settings = signal<CaptureSettings | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  editing = false;
  newAlias = '';

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.settings.set(await this.comms.captureSettings());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load email capture settings');
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(s: CaptureSettings) {
    this.newAlias = s.primaryAlias ?? '';
    this.editing = true;
  }

  async saveAlias() {
    this.saving.set(true);
    try {
      this.settings.set(await this.comms.setCaptureAlias(this.newAlias.trim()));
      this.editing = false;
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'New address saved. Update any Gmail forwarding that used the old one.',
      });
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
