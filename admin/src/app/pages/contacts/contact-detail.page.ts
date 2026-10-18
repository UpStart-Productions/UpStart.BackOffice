import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { PageComponent } from '../../ui/layout/page.component';

@Component({
  selector: 'app-contact-detail-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TextareaModule,
    ToggleSwitchModule,
    PageComponent,
    ActivityTimelineComponent,
  ],
  template: `
    <app-page title="Contact" [skipTitle]="true">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      @if (contact(); as c) {
        <div class="card">
          <div class="page-header-with-back">
            <p-button icon="pi pi-arrow-left" [rounded]="true" [text]="true" severity="secondary" routerLink="/contacts" aria-label="Back to Contacts" />
            <h2 class="page-title page-title-in-card mb-0">{{ name(c) }}</h2>
          </div>

          @if (c.autoCreated) {
            <p-message severity="info" class="block mb-3">
              Created automatically from an email. Check the details, then
              <button type="button" class="link-btn" (click)="markReviewed()">mark as reviewed</button>.
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
              <textarea pTextarea id="notes" [(ngModel)]="form.notes" rows="4" class="w-full"></textarea>
            </div>
            <div class="flex align-items-center gap-2">
              <p-toggleSwitch [(ngModel)]="form.isActive" />
              <label>Active</label>
            </div>
          </div>
          <div class="form-actions">
            <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
          </div>
        </div>

        <div class="card">
          <h3 class="text-lg font-semibold mb-3">Email addresses</h3>
          <p class="text-color-secondary mb-3">Mail from any of these addresses is matched to this contact.</p>
          @for (e of c.emails; track e.id) {
            <div class="row-line">
              <span>{{ e.email }}</span>
              @if (e.isPrimary) { <span class="text-color-secondary">primary</span> }
              <p-button icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="confirmRemoveEmail(e.email)" aria-label="Remove email" />
            </div>
          }
          <div class="row-line mt-2">
            <input pInputText type="email" [(ngModel)]="newEmail" placeholder="Add an email address" class="flex-1" />
            <p-button label="Add" icon="pi pi-plus" severity="secondary" [disabled]="!newEmail.trim()" (onClick)="addEmail()" />
          </div>
        </div>

        <div class="card">
          <h3 class="text-lg font-semibold mb-3">Accounts</h3>
          @for (l of c.accountLinks; track l.clientId) {
            <div class="row-line">
              <a [routerLink]="['/clients', l.clientId]" class="text-primary">{{ l.client.name }}</a>
              @if (l.role) { <span class="text-color-secondary">{{ l.role }}</span> }
              <p-button icon="pi pi-times" severity="secondary" [text]="true" size="small" (onClick)="unlink(l.clientId)" aria-label="Unlink account" />
            </div>
          } @empty {
            <p class="text-color-secondary">Not linked to any client yet.</p>
          }
          <div class="row-line mt-2">
            <p-select
              [options]="clients()"
              optionLabel="name"
              optionValue="id"
              [(ngModel)]="linkClientId"
              [filter]="true"
              filterBy="name"
              placeholder="Link to a client"
              styleClass="w-20rem"
            />
            <input pInputText [(ngModel)]="linkRole" placeholder="Role (optional)" class="flex-1" />
            <p-button label="Link" icon="pi pi-link" severity="secondary" [disabled]="!linkClientId" (onClick)="link()" />
          </div>
        </div>

        <app-activity-timeline [contactId]="c.id" [emailTo]="c.emails[0]?.email" />
      }
    </app-page>
  `,
  styles: `
    .row-line { display: flex; align-items: center; gap: 0.75rem; }
    .link-btn { background: none; border: 0; padding: 0; cursor: pointer; color: var(--primary-color, #2563eb); text-decoration: underline; }
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

  form = { firstName: '', lastName: '', title: '', phone: '', notes: '', isActive: true };
  newEmail = '';
  linkClientId: string | null = null;
  linkRole = '';

  name = contactName;

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    try {
      this.apply(await this.comms.contact(id));
      this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load contact');
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
    };
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
          notes: this.form.notes,
          isActive: this.form.isActive,
        }),
      );
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Contact saved.' });
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
      message: `Remove ${email}? Mail from this address will no longer match this contact.`,
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
