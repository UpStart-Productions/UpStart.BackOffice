import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { senderAndRecipients,
  CommunicationsApi,
  directionLabel,
  Interaction,
  participantLine,
  participantParts,
  relativeTime,
} from '../../core/communications.api';
import { PageComponent } from '../../ui/layout/page.component';
import { MessageBodyComponent } from '../../ui/message-body/message-body.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { PersonComponent } from '../../ui/person/person.component';

type Option = { id: string; label: string };
@Component({
  selector: 'app-unfiled-inbox-page',
  standalone: true,
  imports: [PersonComponent, 
    DatePipe,
    FormsModule,
    AppDialogModule,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    SkeletonModule,
    TableModule,
    TagModule,
    PageComponent,
    MessageBodyComponent,
    RowActionsMenuComponent,
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

        <div class="toolbar">
          <div class="toolbar-start">
            <span class="text-muted" aria-live="polite">{{ countLabel() }}</span>
          </div>
          <div class="toolbar-search">
            <p-iconfield iconPosition="left" class="toolbar-search-field">
              <p-inputicon><i class="pi pi-search"></i></p-inputicon>
              <input
                pInputText
                type="text"
                class="w-full"
                placeholder="Search subject or people…"
                aria-label="Search the inbox"
                [ngModel]="query()"
                (ngModelChange)="query.set($event)"
              />
            </p-iconfield>
            @if (query()) {
              <p-button icon="pi pi-times" [text]="true" severity="secondary" aria-label="Clear search" (onClick)="query.set('')" />
            }
          </div>
        </div>

        @if (loading() && items().length === 0) {
          <div class="skeleton-list" aria-busy="true" aria-label="Loading inbox">
            @for (n of skeletonRows; track n) {
              <div class="skeleton-row">
                <p-skeleton width="6rem" height="1rem" />
                <p-skeleton width="12rem" height="1rem" />
                <p-skeleton height="1rem" styleClass="skeleton-grow" />
              </div>
            }
          </div>
        } @else {
          <p-table [value]="filtered()" [loading]="loading()" styleClass="table-bordered" dataKey="id">
            <ng-template pTemplate="header">
              <tr>
                <th style="width: 3rem"></th>
                <th style="width: 8rem">Received</th>
                <th style="width: 20rem">People</th>
                <th>Subject</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-item>
              <tr class="clickable-row" (click)="mb.toggle()">
                <td (click)="$event.stopPropagation()">
                  <app-row-actions-menu [items]="rowActions(item)" ariaLabel="Email actions" />
                </td>
                <td>
                  <span [title]="(item.occurredAt | date: 'MMM d, y, h:mm a') ?? ''">{{ rel(item.occurredAt) }}</span>
                </td>
                <td>
                  @let ppl = sendersOf(item);
                  <div class="person-line">
                    <span class="person-label">From</span>
                    <span class="person-value">
                      @if (ppl.from) {
                        <app-person [name]="ppl.from.name" [email]="ppl.from.email" [avatarUrl]="ppl.from.avatarUrl" [personId]="ppl.from.contactId ?? ppl.from.userId ?? ppl.from.email" [size]="22" />
                      } @else { — }
                    </span>
                  </div>
                  <div class="person-line text-color-secondary">
                    <span class="person-label">To</span>
                    <span class="person-value person-list">
                      @for (p of ppl.to; track p.email) {
                        <app-person [name]="p.name" [email]="p.email" [avatarUrl]="p.avatarUrl" [personId]="p.contactId ?? p.userId ?? p.email" [size]="22" />
                      } @empty { — }
                    </span>
                  </div>
                  <p-tag [value]="dir(item)" severity="secondary" class="person-tag" />
                </td>
                <td>
                  <strong>{{ item.subject || '(no subject)' }}</strong>
                  <app-message-body #mb [item]="item" />
                </td>
              </tr>
            </ng-template>
            <ng-template pTemplate="emptymessage">
              <tr>
                <td colspan="4">
                  <div class="empty-state">
                    @if (items().length === 0) {
                      <i class="pi pi-check-circle" aria-hidden="true"></i>
                      <p>Nothing to file. You're all caught up.</p>
                    } @else {
                      <i class="pi pi-search" aria-hidden="true"></i>
                      <p>No emails match "{{ query() }}".</p>
                    }
                  </div>
                </td>
              </tr>
            </ng-template>
          </p-table>
        }

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
              filterPlaceholder="Search…"
              [showClear]="true"
              [placeholder]="kind === 'client' ? 'Choose an organization' : 'Choose a pipeline card'"
              [ariaLabel]="kind === 'client' ? 'Organization' : 'Pipeline card'"
              styleClass="w-full"
              appendTo="body"
            />
            @if (kind === 'client') {
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="learn" [(ngModel)]="learn" [binary]="true" />
                <label for="learn">Link the people on this email to the organization</label>
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
    .file-form { display: flex; flex-direction: column; gap: 1rem; }
    .clickable-row { cursor: pointer; }
    .clickable-row:hover { background: var(--surface-50, #f9fafb); }
    .person-line { display: flex; gap: 0.5rem; min-width: 0; }
    .person-label { flex: 0 0 2.5rem; font-size: 0.8rem; color: var(--text-color-secondary); }
    .person-value { min-width: 0; overflow-wrap: anywhere; }
    .person-list { display: flex; flex-wrap: wrap; gap: 0.25rem 0.75rem; }
    .person-tag { display: inline-block; margin-top: 0.35rem; }
    .skeleton-list { display: flex; flex-direction: column; gap: 1rem; padding: 0.5rem 0; }
    .skeleton-row { display: flex; align-items: center; gap: 1.5rem; }
    :host ::ng-deep .skeleton-grow { flex: 1; }
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
  query = signal('');
  readonly skeletonRows = [1, 2, 3, 4];

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
    { label: 'Organization', value: 'client' },
    { label: 'Pipeline card', value: 'lead' },
  ];

  readonly sendersOf = senderAndRecipients;
  rel = relativeTime;
  dir = directionLabel;
  people = (i: Interaction) => participantLine(i);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.items();
    if (!q) return list;
    return list.filter((i) =>
      [i.subject, i.snippet, ...i.participants.flatMap((p) => [p.name, p.email])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  });

  readonly countLabel = computed(() => {
    const total = this.items().length;
    const shown = this.filtered().length;
    const more = this.nextBefore() ? '+' : '';
    if (shown !== total) return `${shown} of ${total}${more} emails`;
    return `${total}${more} email${total === 1 && !more ? '' : 's'} to file`;
  });

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

  rowActions(item: Interaction): RowActionItem[] {
    return [{ id: 'file', label: 'File…', icon: 'pi pi-folder', command: () => void this.openFile(item) }];
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
