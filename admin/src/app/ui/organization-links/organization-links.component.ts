import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { HelpTextComponent } from '../help-text/help-text.component';

/**
 * Organizations side panel for a person: linked organizations, role, and link/unlink.
 * The only place this panel is built. Callers pass the person and take the updated person back.
 */
@Component({
  selector: 'app-organization-links',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SelectModule, HelpTextComponent],
  template: `
    <div class="card card--side">
      <div class="card-header">
        <h3 class="card-title">Organizations</h3>
      </div>
      @for (l of contact().accountLinks; track l.clientId) {
        <div class="org-link-row">
          <div class="org-link-main">
            <a [routerLink]="orgLink(l.client)" class="text-primary">{{ l.client.name }}</a>
            @if (l.role) {
              <span class="org-link-role">{{ l.role }}</span>
            }
          </div>
          <p-button
            icon="pi pi-trash"
            severity="danger"
            [text]="true"
            size="small"
            (onClick)="confirmUnlink(l.client)"
            aria-label="Remove organization link"
          />
        </div>
      } @empty {
        <p class="text-color-secondary mt-0 mb-3">Not linked to any organization. That's fine for an individual.</p>
        <p-button
          label="Make client from this person"
          icon="pi pi-user-plus"
          size="small"
          severity="success"
          (onClick)="createClientFromContact()"
        />
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
      <div class="form-field mb-2">
        <label for="linkRole">Role <app-help-text key="person.orgRole" /></label>
        <div class="org-link-add">
          <input pInputText id="linkRole" [(ngModel)]="linkRole" placeholder="e.g. Board member" class="w-full" />
          <p-button
            label="Link"
            icon="pi pi-link"
            severity="secondary"
            size="small"
            [disabled]="!linkClientId"
            (onClick)="link()"
          />
        </div>
      </div>
    </div>
  `,
  styles: `
    .org-link-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--surface-border);
    }
    .org-link-row:first-of-type {
      border-top: 0;
      padding-top: 0;
    }
    .org-link-main {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .org-link-role {
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
    }
    .org-link-add {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }
  `,
})
export class OrganizationLinksComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  contact = input.required<ContactSummary>();
  contactChange = output<ContactSummary>();

  clients = signal<{ id: string; name: string }[]>([]);
  linkClientId: string | null = null;
  linkRole = '';

  async ngOnInit() {
    await this.loadClients();
  }

  orgLink(client: { id: string; journey: string }): string[] {
    return client.journey === 'CLIENT'
      ? ['/clients', client.id]
      : ['/organizations', client.id];
  }

  /** For a person with no organization: make an organization named after them and link it. */
  async createClientFromContact() {
    const c = this.contact();
    try {
      const created = await this.api.post<{ id: string }>('/clients', {
        name: contactName(c),
        journey: 'CLIENT',
        email: c.emails[0]?.email,
        phone: c.phone ?? undefined,
      });
      this.contactChange.emit(await this.comms.linkAccount(c.id, created.id));
      await this.loadClients();
      this.toast.add({ severity: 'success', summary: 'Client created', detail: 'Linked to this person.' });
    } catch (err) {
      this.fail(err, 'Could not create client');
    }
  }

  async link() {
    const c = this.contact();
    if (!this.linkClientId) return;
    try {
      this.contactChange.emit(await this.comms.linkAccount(c.id, this.linkClientId, this.linkRole.trim()));
      this.linkClientId = null;
      this.linkRole = '';
    } catch (err) {
      this.fail(err, 'Could not link account');
    }
  }

  confirmUnlink(client: { id: string; name: string }) {
    this.confirmDelete.confirm({
      header: 'Remove link',
      message: `Remove the link to "${client.name}"?`,
      accept: () => this.unlink(client.id),
    });
  }

  async unlink(clientId: string) {
    try {
      this.contactChange.emit(await this.comms.unlinkAccount(this.contact().id, clientId));
    } catch (err) {
      this.fail(err, 'Could not unlink account');
    }
  }

  private async loadClients() {
    try {
      this.clients.set(await this.api.get<{ id: string; name: string }[]>('/clients'));
    } catch (err) {
      this.fail(err, 'Could not load organizations');
    }
  }

  private fail(err: unknown, fallback: string) {
    this.toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : fallback });
  }
}
