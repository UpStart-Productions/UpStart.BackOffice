import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { PageComponent } from '../../ui/layout/page.component';
import { PersonComponent } from '../../ui/person/person.component';
import { CrmTagInputComponent } from '../../ui/crm-tags/crm-tag-input.component';
import { ACCOUNT_JOURNEY_LABELS } from '@upstart/back-office/shared';

@Component({
  selector: 'app-contact-detail-page',
  standalone: true,
  imports: [PersonComponent, 
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    QuillModule,
    PageComponent,
    ActivityTimelineComponent,
    CrmTagInputComponent,
  ],
  template: `
    <app-page title="Person" [skipTitle]="true">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      @if (contact(); as c) {
        <div class="grid grid-3">
          <div class="stack span-2">
            <div class="card">
              <div class="page-header-with-back">
                <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" severity="secondary" routerLink="/people" aria-label="Back to People" />
                <app-person [name]="name(c)" [firstName]="c.firstName" [lastName]="c.lastName" [email]="c.emails[0]?.email" [avatarUrl]="c.avatarUrl" [personId]="c.id" [size]="40" [avatarOnly]="true" />
                <h2 class="page-title page-title-in-card mb-0">{{ name(c) }}</h2>
              </div>

              @if (c.autoCreated) {
                <p-message severity="info" class="block mb-3">
                  <div class="flex align-items-center flex-wrap gap-3">
                    <span>Created automatically from an email. Check the details, then mark it reviewed.</span>
                    <p-button label="Mark as reviewed" size="small" severity="secondary" (onClick)="markReviewed()" />
                  </div>
                </p-message>
              }

              <div class="showcase-flex-col">
                <div class="showcase-row">
                  <div class="form-field showcase-half">
                    <label for="firstName">First name</label>
                    <input pInputText id="firstName" [(ngModel)]="form.firstName" class="w-full" />
                  </div>
                  <div class="form-field showcase-half">
                    <label for="lastName">Last name</label>
                    <input pInputText id="lastName" [(ngModel)]="form.lastName" class="w-full" />
                  </div>
                </div>
                <div class="showcase-row">
                  <div class="form-field showcase-half">
                    <label for="title">Title</label>
                    <input pInputText id="title" [(ngModel)]="form.title" class="w-full" />
                  </div>
                  <div class="form-field showcase-half">
                    <label for="phone">Phone</label>
                    <input pInputText id="phone" [(ngModel)]="form.phone" class="w-full" />
                  </div>
                </div>
                <div class="form-field showcase-full">
                  <label for="notes">Notes</label>
                  <quill-editor
                    id="notes"
                    name="notes"
                    [(ngModel)]="form.notes"
                    placeholder="Notes…"
                    [styles]="{ 'min-height': '140px' }"
                  ></quill-editor>
                </div>
                <div class="form-field showcase-full">
                  <label for="personTags">Tags</label>
                  <app-crm-tag-input [(tags)]="form.tags" inputId="personTags" />
                </div>
              </div>
              <div class="form-actions">
                <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!dirty()" (onClick)="save()" />
              </div>
            </div>

            <app-activity-timeline [contactId]="c.id" [emailTo]="c.emails[0]?.email" />
          </div>

          <div class="stack span-1">
            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Email addresses</h3>
              </div>
              <p class="text-color-secondary mt-0 mb-3 text-sm">Mail from any of these addresses is matched to this person.</p>
              @for (e of c.emails; track e.id) {
                <div class="side-row-line">
                  <span class="side-row-line-main">{{ e.email }}</span>
                  @if (e.isPrimary) { <p-tag value="Primary" severity="info" /> }
                  <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmRemoveEmail(e.email)" aria-label="Remove email" />
                </div>
              }
              <div class="side-row-line side-row-line--add">
                <input pInputText type="email" [(ngModel)]="newEmail" placeholder="Add an email address" class="w-full" />
                <p-button label="Add" icon="pi pi-plus" severity="secondary" [disabled]="!newEmail.trim()" (onClick)="addEmail()" />
              </div>
            </div>

            <div class="card card--side">
              <div class="card-header">
                <h3 class="card-title">Organizations</h3>
              </div>
              @for (l of c.accountLinks; track l.clientId) {
                <div class="side-row-line side-row-line--org">
                  <div class="side-row-line-org">
                    <a [routerLink]="orgLink(l.client)" class="text-primary">{{ l.client.name }}</a>
                    @if (l.role) { <span class="text-color-secondary text-sm">{{ l.role }}</span> }
                  </div>
                  <div class="side-row-line-actions">
                    @if (l.client.journey === 'CLIENT') {
                      <p-tag value="Client" severity="success" />
                    } @else {
                      <p-tag [value]="journeyLabels[l.client.journey]" severity="secondary" />
                      <p-button label="Make client" size="small" severity="success" [text]="true" (onClick)="makeClient(l.clientId)" />
                    }
                    <p-button icon="pi pi-times" severity="secondary" [text]="true" size="small" (onClick)="unlink(l.clientId)" aria-label="Unlink organization" />
                  </div>
                </div>
              } @empty {
                <p class="text-color-secondary mt-0 mb-3">Not linked to any organization. That's fine for an individual.</p>
                <p-button label="Make client from this person" icon="pi pi-user-plus" size="small" severity="success" (onClick)="createClientFromContact()" />
              }
              <div class="form-field mt-3 mb-2">
                <label for="linkOrg">Link to an organization</label>
                <p-select
                  inputId="linkOrg"
                  [options]="clients()"
                  optionLabel="name"
                  optionValue="id"
                  [(ngModel)]="linkClientId"
                  [filter]="true"
                  filterBy="name"
                  filterPlaceholder="Search…"
                  [showClear]="true"
                  placeholder="Search and select…"
                  styleClass="w-full"
                  appendTo="body"
                />
              </div>
              <div class="side-row-line side-row-line--add">
                <input pInputText [(ngModel)]="linkRole" placeholder="Role (optional)" class="w-full" />
                <p-button label="Link" icon="pi pi-link" severity="secondary" [disabled]="!linkClientId" (onClick)="link()" />
              </div>
            </div>
          </div>
        </div>
      }
    </app-page>
  `,
  styles: `
    .side-row-line {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--surface-border);
    }
    .card-header + p + .side-row-line,
    .side-row-line:first-of-type {
      border-top: 0;
      padding-top: 0;
    }
    .side-row-line-main {
      flex: 1 1 auto;
      min-width: 0;
      word-break: break-word;
    }
    .side-row-line--add {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
      border-top: 0;
      padding-top: 0.75rem;
    }
    .side-row-line--org {
      flex-direction: column;
      align-items: stretch;
      gap: 0.35rem;
    }
    .side-row-line-org {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      min-width: 0;
    }
    .side-row-line-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
    }
  `,
})
export class ContactDetailPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  contact = signal<ContactSummary | null>(null);
  clients = signal<{ id: string; name: string }[]>([]);
  error = signal<string | null>(null);
  saving = signal(false);

  form = { firstName: '', lastName: '', title: '', phone: '', notes: '', isActive: true, tags: [] as string[] };
  newEmail = '';
  linkClientId: string | null = null;
  linkRole = '';

  name = contactName;
  readonly journeyLabels = ACCOUNT_JOURNEY_LABELS;

  orgLink(client: { id: string; journey: string }): string[] {
    return client.journey === 'CLIENT' || client.journey === 'PAST_CLIENT'
      ? ['/clients', client.id]
      : ['/organizations', client.id];
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    try {
      this.apply(await this.comms.contact(id));
      this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load person');
    }
  }

  /** Flip a linked prospect or past client to Client. */
  async makeClient(clientId: string) {
    const c = this.contact();
    if (!c) return;
    try {
      await this.api.put(`/clients/${clientId}`, { journey: 'CLIENT' });
      this.apply(await this.comms.contact(c.id));
      this.toast.add({ severity: 'success', summary: 'Now a client', detail: 'Projects, time and invoices are available.' });
    } catch (err) {
      this.fail(err, 'Could not update');
    }
  }

  /** For a person with no organization (an individual client): make an organization named after them and link it. */
  async createClientFromContact() {
    const c = this.contact();
    if (!c) return;
    try {
      const created = await this.api.post<{ id: string }>('/clients', {
        name: contactName(c),
        journey: 'CLIENT',
        email: c.emails[0]?.email,
        phone: c.phone ?? undefined,
      });
      this.apply(await this.comms.linkAccount(c.id, created.id));
      this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
      this.toast.add({ severity: 'success', summary: 'Client created', detail: 'Linked to this person.' });
    } catch (err) {
      this.fail(err, 'Could not create client');
    }
  }

  private apply(c: ContactSummary) {
    this.contact.set(c);
    this.form = {
      firstName: c.firstName,
      lastName: c.lastName ?? '',
      title: c.title ?? '',
      phone: c.phone ?? '',
      notes: c.notes ?? '',
      isActive: c.isActive,
      tags: [...(c.tags ?? [])],
    };
  }

  /** True when the form differs from the saved contact. */
  dirty(): boolean {
    const c = this.contact();
    if (!c) return false;
    const f = this.form;
    return (
      f.firstName !== c.firstName ||
      f.lastName !== (c.lastName ?? '') ||
      f.title !== (c.title ?? '') ||
      f.phone !== (c.phone ?? '') ||
      f.notes !== (c.notes ?? '') ||
      f.isActive !== c.isActive ||
      f.tags.join('\n') !== (c.tags ?? []).join('\n')
    );
  }

  private fail(err: unknown, fallback: string) {
    this.toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : fallback });
  }

  async save() {
    const c = this.contact();
    if (!c) return;
    if (!this.form.firstName.trim()) {
      this.toast.add({ severity: 'warn', summary: 'Missing name', detail: 'First name is required.' });
      return;
    }
    this.saving.set(true);
    try {
      this.apply(
        await this.comms.updateContact(c.id, {
          firstName: this.form.firstName,
          lastName: this.form.lastName,
          title: this.form.title,
          phone: this.form.phone,
          notes: richTextOrUndefined(this.form.notes),
          isActive: this.form.isActive,
          tags: this.form.tags,
        }),
      );
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Person saved.' });
    } catch (err) {
      this.fail(err, 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async markReviewed() {
    const c = this.contact();
    if (!c) return;
    try {
      this.apply(await this.comms.updateContact(c.id, { autoCreated: false }));
    } catch (err) {
      this.fail(err, 'Update failed');
    }
  }

  async addEmail() {
    const c = this.contact();
    if (!c) return;
    try {
      this.apply(await this.comms.addEmail(c.id, this.newEmail.trim()));
      this.newEmail = '';
    } catch (err) {
      this.fail(err, 'Could not add email');
    }
  }

  confirmRemoveEmail(email: string) {
    this.confirm.confirm({
      header: 'Remove email',
      message: `Remove ${email}? Mail from this address will no longer match this person.`,
      accept: async () => {
        const c = this.contact();
        if (!c) return;
        try {
          this.apply(await this.comms.removeEmail(c.id, email));
        } catch (err) {
          this.fail(err, 'Could not remove email');
        }
      },
    });
  }

  async link() {
    const c = this.contact();
    if (!c || !this.linkClientId) return;
    try {
      this.apply(await this.comms.linkAccount(c.id, this.linkClientId, this.linkRole.trim()));
      this.linkClientId = null;
      this.linkRole = '';
    } catch (err) {
      this.fail(err, 'Could not link account');
    }
  }

  async unlink(clientId: string) {
    const c = this.contact();
    if (!c) return;
    try {
      this.apply(await this.comms.unlinkAccount(c.id, clientId));
    } catch (err) {
      this.fail(err, 'Could not unlink account');
    }
  }
}
