import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CommunicationsApi, Interaction, participantLine } from '../../core/communications.api';
import { PageComponent } from '../../ui/layout/page.component';

type Option = { id: string; label: string };
type OpenMessage = { body: string; full: string | null; showFull: boolean };

@Component({
  selector: 'app-unfiled-inbox-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    AppDialogModule,
    ButtonModule,
    CheckboxModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    PageComponent,
  ],
  template: `
    <app-page title="Inbox" [skipTitle]="true">
      <div class="card">
        <h2 class="page-title page-title-in-card">Unfiled inbox</h2>
        <p class="text-color-secondary mb-3">
          Emails CC'd to UBO that we couldn't match to a client or lead. File one and the rest of its thread
          follows, and we remember the people on it so their next email files itself.
        </p>

        @if (error()) {
          <p-message severity="error" [text]="error()!" class="mb-3" />
        }

        <p-table [value]="items()" [loading]="loading()" styleClass="table-bordered" dataKey="id">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 11rem">Date</th>
              <th style="width: 18rem">People</th>
              <th>Subject</th>
              <th style="width: 11rem"></th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-item>
            <tr>
              <td>{{ item.occurredAt | date: 'MMM d, y, h:mm a' }}</td>
              <td>{{ people(item) }}</td>
              <td>
                <strong>{{ item.subject || '(no subject)' }}</strong>
                @if (open()[item.id]; as msg) {
                  <pre class="inbox-text">{{ msg.showFull && msg.full ? msg.full : msg.body }}</pre>
                } @else if (item.snippet) {
                  <div class="text-color-secondary">{{ item.snippet }}</div>
                }
                @if (item.snippet) {
                  <button type="button" class="link-btn" (click)="toggle(item)">
                    {{ open()[item.id] ? 'Show less' : 'Read more' }}
                  </button>
                }
                @if (open()[item.id]?.full) {
                  <button type="button" class="link-btn ml-3" (click)="toggleFull(item)">
                    {{ open()[item.id]?.showFull ? 'Hide quoted text' : 'Show quoted text' }}
                  </button>
                }
              </td>
              <td class="text-right">
                <p-button label="File…" icon="pi pi-folder" size="small" (onClick)="openFile(item)" />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="4" class="text-center p-4 text-color-secondary">Nothing to file. You're all caught up.</td>
            </tr>
          </ng-template>
        </p-table>

        @if (nextBefore()) {
          <div class="text-center mt-3">
            <p-button label="Load older" severity="secondary" [text]="true" [loading]="loading()" (onClick)="load(true)" />
          </div>
        }
      </div>

      <p-dialog
        header="File this email"
        [(visible)]="fileVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [closable]="!saving()"
        [style]="{ width: 'min(32rem, 96vw)' }"
      >
        @if (active(); as item) {
          <p class="mb-3">
            <strong>{{ item.subject || '(no subject)' }}</strong><br />
            <span class="text-color-secondary">{{ people(item) }}</span>
          </p>
          <div class="file-form">
            <p-selectbutton
              [options]="kindOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="kind"
              [allowEmpty]="false"
              (onChange)="targetId = null"
            />
            <p-select
              [options]="kind === 'client' ? clients() : leads()"
              optionLabel="label"
              optionValue="id"
              [(ngModel)]="targetId"
              [filter]="true"
              filterBy="label"
              [placeholder]="kind === 'client' ? 'Choose a client' : 'Choose a lead'"
              styleClass="w-full"
            />
            @if (kind === 'client') {
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="learn" [(ngModel)]="learn" [binary]="true" />
                <label for="learn">Link the people on this email to the client</label>
              </div>
            }
            @if (fileError()) {
              <p-message severity="error" [text]="fileError()!" />
            }
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="fileVisible = false" />
          <p-button label="File" icon="pi pi-check" [loading]="saving()" [disabled]="!targetId" (onClick)="saveFile()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `
    .inbox-text { margin: 0.5rem 0; white-space: pre-wrap; word-break: break-word; font: inherit; max-height: 24rem; overflow: auto; background: var(--surface-50, #f9fafb); padding: 0.75rem; border-radius: 6px; }
    .link-btn { background: none; border: 0; padding: 0; cursor: pointer; font-size: 0.85rem; color: var(--primary-color, #2563eb); }
    .file-form { display: flex; flex-direction: column; gap: 1rem; }
  `,
})
export class UnfiledInboxPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  items = signal<Interaction[]>([]);
  nextBefore = signal<string | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  open = signal<Record<string, OpenMessage>>({});

  clients = signal<Option[]>([]);
  leads = signal<Option[]>([]);

  fileVisible = false;
  active = signal<Interaction | null>(null);
  kind: 'client' | 'lead' = 'client';
  targetId: string | null = null;
  learn = true;
  saving = signal(false);
  fileError = signal<string | null>(null);

  readonly kindOptions = [
    { label: 'Client', value: 'client' },
    { label: 'Lead', value: 'lead' },
  ];

  people = (i: Interaction) => participantLine(i);

  async ngOnInit() {
    await this.load(false);
  }

  async load(more: boolean) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.comms.unfiled(more ? this.nextBefore() : null);
      this.items.set(more ? [...this.items(), ...page.items] : page.items);
      this.nextBefore.set(page.nextBefore);
      void this.comms.refreshUnfiledCount();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load the inbox');
    } finally {
      this.loading.set(false);
    }
  }

  async toggle(item: Interaction) {
    const current = this.open();
    if (current[item.id]) {
      const { [item.id]: _removed, ...rest } = current;
      this.open.set(rest);
      return;
    }
    try {
      const one = await this.comms.interaction(item.id);
      this.open.set({
        ...current,
        [item.id]: { body: one.bodyText ?? item.snippet ?? '', full: one.fullText ?? null, showFull: false },
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load message');
    }
  }

  toggleFull(item: Interaction) {
    const current = this.open()[item.id];
    if (!current) return;
    this.open.set({ ...this.open(), [item.id]: { ...current, showFull: !current.showFull } });
  }

  async openFile(item: Interaction) {
    this.active.set(item);
    this.kind = 'client';
    this.targetId = null;
    this.learn = true;
    this.fileError.set(null);
    this.fileVisible = true;
    if (this.clients().length === 0) {
      try {
        const clients = await this.api.get<{ id: string; name: string }[]>('/clients');
        this.clients.set(clients.map((c) => ({ id: c.id, label: c.name })));
        const leads = await this.api.get<{ id: string; organization: string }[]>('/leads');
        this.leads.set(leads.map((l) => ({ id: l.id, label: l.organization })));
      } catch (err) {
        this.fileError.set(err instanceof Error ? err.message : 'Failed to load clients');
      }
    }
  }

  async saveFile() {
    const item = this.active();
    if (!item || !this.targetId) return;
    this.saving.set(true);
    this.fileError.set(null);
    try {
      const res = await this.comms.file(
        item.id,
        this.kind === 'client'
          ? { clientId: this.targetId, learn: this.learn }
          : { leadId: this.targetId },
      );
      this.fileVisible = false;
      const parts = ['Filed.'];
      if (res.threadItemsFiled) parts.push(`${res.threadItemsFiled} more from the same thread filed too.`);
      if (res.contactsLinked) {
        parts.push(`Linked ${res.contactsLinked} contact${res.contactsLinked === 1 ? '' : 's'} to the client.`);
      }
      this.toast.add({ severity: 'success', summary: 'Filed', detail: parts.join(' ') });
      // Other rows from the thread may have been filed with it, so reload rather than splice.
      await this.load(false);
    } catch (err) {
      this.fileError.set(err instanceof Error ? err.message : 'Filing failed');
    } finally {
      this.saving.set(false);
    }
  }
}
