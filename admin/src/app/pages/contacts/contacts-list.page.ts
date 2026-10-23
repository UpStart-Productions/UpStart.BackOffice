import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

@Component({
  selector: 'app-contacts-list-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    AppDialogModule,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    PageComponent,
    CopyEmailComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page title="Contacts" [skipTitle]="true">
      <div class="card">
        <h2 class="page-title page-title-in-card">Contacts</h2>
        @if (error()) {
          <p-message severity="error" [text]="error()!" class="mb-3" />
        }
        <div class="toolbar">
          <p-button label="New Contact" icon="pi pi-plus" (onClick)="openNew()" />
          <div class="toolbar-search">
            <p-iconfield iconPosition="left" class="toolbar-search-field">
              <p-inputicon><i class="pi pi-search"></i></p-inputicon>
              <input
                pInputText
                type="text"
                class="w-full"
                placeholder="Search by name or email…"
                [ngModel]="query"
                (ngModelChange)="onSearch($event)"
                aria-label="Search contacts"
              />
            </p-iconfield>
            @if (query) {
              <p-button icon="pi pi-times" [text]="true" severity="secondary" aria-label="Clear search" (onClick)="onSearch('')" />
            }
            <div class="flex align-items-center gap-2 ml-3">
              <p-checkbox inputId="review" [ngModel]="review" (ngModelChange)="onReview($event)" [binary]="true" />
              <label for="review">Needs review</label>
              @if (reviewCount() > 0) {
                <p-tag [value]="'' + reviewCount()" severity="info" />
              }
            </div>
          </div>
        </div>

        <p-table
          [value]="contacts()"
          [loading]="loading()"
          styleClass="table-bordered"
          [paginator]="contacts().length > pageSize"
          [rows]="pageSize"
        >
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th pSortableColumn="firstName">
                Name
                <p-sortIcon field="firstName" />
              </th>
              <th>Email</th>
              <th>Accounts</th>
              <th style="width: 10rem" pSortableColumn="lastContactAt">
                Last contact
                <p-sortIcon field="lastContactAt" />
              </th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td>
                <app-row-actions-menu [items]="rowActions(c)" ariaLabel="Contact actions" />
              </td>
              <td>
                <a [routerLink]="['/contacts', c.id]" class="text-primary">{{ name(c) }}</a>
                @if (c.autoCreated) {
                  <p-tag value="New" severity="info" class="ml-2" />
                }
                @if (!c.isActive) {
                  <p-tag value="Inactive" severity="secondary" class="ml-2" />
                }
              </td>
              <td><app-copy-email [email]="c.emails[0]?.email" /></td>
              <td>
                @for (link of c.accountLinks; track link.clientId; let last = $last) {
                  <a [routerLink]="['/clients', link.clientId]" class="text-primary">{{ link.client.name }}</a>{{ last ? '' : ', ' }}
                } @empty {
                  <span class="text-color-secondary">—</span>
                }
              </td>
              <td>{{ c.lastContactAt ? (c.lastContactAt | date: 'MMM d, y') : '—' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">
                <div class="empty-state">
                  <i class="pi pi-address-book" aria-hidden="true"></i>
                  <p>{{ review ? 'Nothing needs review.' : query ? 'No contacts match your search.' : 'No contacts yet.' }}</p>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog
        header="New contact"
        [(visible)]="newVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [closable]="!saving()"
        [style]="{ width: 'min(32rem, 96vw)' }"
      >
        <div class="new-form">
          <div class="form-field">
            <label for="nFirst">First name</label>
            <input pInputText id="nFirst" [(ngModel)]="form.firstName" class="w-full" />
          </div>
          <div class="form-field">
            <label for="nLast">Last name</label>
            <input pInputText id="nLast" [(ngModel)]="form.lastName" class="w-full" />
          </div>
          <div class="form-field">
            <label for="nEmail">Email</label>
            <input pInputText id="nEmail" type="email" [(ngModel)]="form.email" class="w-full" />
          </div>
          <div class="form-field">
            <label for="nClient">Client (optional)</label>
            <p-select
              inputId="nClient"
              [options]="clients()"
              optionLabel="name"
              optionValue="id"
              [(ngModel)]="form.clientId"
              [filter]="true"
              filterBy="name"
              [showClear]="true"
              placeholder="Link to a client"
              styleClass="w-full"
            />
          </div>
          @if (form.clientId) {
            <div class="form-field">
              <label for="nRole">Role</label>
              <input pInputText id="nRole" [(ngModel)]="form.role" class="w-full" placeholder="e.g. Case manager" />
            </div>
          }
          @if (formError()) {
            <p-message severity="error" [text]="formError()!" />
          }
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="newVisible = false" />
          <p-button label="Create" icon="pi pi-check" [loading]="saving()" (onClick)="create()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `
    .new-form { display: flex; flex-direction: column; gap: 1rem; }
  `,
})
export class ContactsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  contacts = signal<ContactSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  query = '';
  review = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  newVisible = false;
  saving = signal(false);
  formError = signal<string | null>(null);
  clients = signal<{ id: string; name: string }[]>([]);
  form = { firstName: '', lastName: '', email: '', clientId: null as string | null, role: '' };

  name = contactName;
  readonly pageSize = 25;
  /** Contacts awaiting review, from the last unsearched load. */
  reviewCount = signal(0);

  async ngOnInit() {
    await this.load();
    // "Add person" on a client page links here with ?newForClient=<clientId>.
    const forClient = this.route.snapshot.queryParamMap.get('newForClient');
    if (forClient) {
      await this.openNew();
      this.form.clientId = forClient;
    }
  }

  onSearch(value: string) {
    this.query = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 250);
  }

  onReview(value: boolean) {
    this.review = value;
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.comms.contacts({ q: this.query, review: this.review });
      this.contacts.set(list);
      if (!this.query.trim()) this.reviewCount.set(this.review ? list.length : list.filter((c) => c.autoCreated).length);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load contacts');
    } finally {
      this.loading.set(false);
    }
  }

  rowActions(c: ContactSummary): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'open', label: 'Open', icon: 'pi pi-pencil', command: () => this.router.navigate(['/contacts', c.id]) },
    ];
    if (c.autoCreated) {
      items.push({ id: 'reviewed', label: 'Mark as reviewed', icon: 'pi pi-check', command: () => void this.markReviewed(c) });
    }
    return items;
  }

  async markReviewed(c: ContactSummary) {
    try {
      await this.comms.updateContact(c.id, { autoCreated: false });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async openNew() {
    this.form = { firstName: '', lastName: '', email: '', clientId: null, role: '' };
    this.formError.set(null);
    this.newVisible = true;
    if (this.clients().length === 0) {
      try {
        this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
      } catch {
        this.clients.set([]);
      }
    }
  }

  async create() {
    if (!this.form.firstName.trim()) {
      this.formError.set('First name is required.');
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    try {
      const created = await this.comms.createContact({
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim() || undefined,
        email: this.form.email.trim() || undefined,
        clientId: this.form.clientId ?? undefined,
        role: this.form.clientId ? this.form.role.trim() || undefined : undefined,
      });
      this.newVisible = false;
      await this.router.navigate(['/contacts', created.id]);
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : 'Create failed');
    } finally {
      this.saving.set(false);
    }
  }
}
