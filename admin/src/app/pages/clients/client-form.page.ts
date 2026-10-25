import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { PeopleCardComponent } from '../../ui/people-card/people-card.component';
import { CrmTagInputComponent } from '../../ui/crm-tags/crm-tag-input.component';
import type { AccountJourney, ClientDto } from '@upstart/back-office/shared';
import { ACCOUNT_JOURNEY_LABELS, US_STATES } from '@upstart/back-office/shared';

type ClientProject = {
  id: string;
  name: string;
  isBillable: boolean;
  isActive: boolean;
  hourlyRate?: number | null;
};

type NewOrgType = 'prospect' | 'client' | 'partner';

type ClientForm = {
  name: string;
  code: string;
  journey: AccountJourney;
  tags: string[];
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  notes: string;
  isActive: boolean;
};

@Component({
  selector: 'app-client-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    ToggleSwitchModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    QuillModule,
    PageComponent,
    ArtifactsPanelComponent,
    ActivityTimelineComponent,
    PeopleCardComponent,
    CrmTagInputComponent,
  ],
  templateUrl: './client-form.page.html',
  styleUrl: './client-form.page.scss',
})
export class ClientFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));

  readonly usStates = US_STATES;
  readonly journeyOptions = (Object.keys(ACCOUNT_JOURNEY_LABELS) as AccountJourney[])
    .filter((value) => value !== 'NONE')
    .map((value) => ({
      value,
      label: ACCOUNT_JOURNEY_LABELS[value],
    }));

  /** What a new organization is. Partner is status Other plus the Partner tag; Prospect also gets a pipeline card. */
  readonly typeOptions: { value: NewOrgType; label: string }[] = [
    { value: 'prospect', label: 'Prospect' },
    { value: 'client', label: 'Client' },
    { value: 'partner', label: 'Partner' },
  ];
  newType: NewOrgType = 'prospect';
  /** Where Back and Cancel go: Clients when opened from there, else Organizations. */
  backLink = '/organizations';

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  portalBusy = signal(false);
  error = signal<string | null>(null);
  portalEnabled = signal(false);
  portalUrl = signal<string | null>(null);
  projects = signal<ClientProject[]>([]);
  projectsLoading = signal(false);

  form: ClientForm = {
    name: '',
    code: '',
    journey: 'CLIENT',
    tags: [],
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    website: '',
    notes: '',
    isActive: true,
  };

  get isNew() {
    return !this.id();
  }

  /** New or edit under Office → Clients (not CRM → Organizations). */
  get isClientFlow(): boolean {
    return this.backLink === '/clients';
  }

  private str(v: string | null | undefined): string {
    return v ?? '';
  }

  private patchForm(client: ClientDto) {
    this.form = {
      name: client.name,
      code: this.str(client.code),
      journey: client.journey,
      tags: client.tags ?? [],
      email: this.str(client.email),
      phone: this.str(client.phone),
      address: this.str(client.address),
      city: this.str(client.city),
      state: this.str(client.state),
      zip: this.str(client.zip),
      website: this.str(client.website),
      notes: this.str(client.notes),
      isActive: client.isActive,
    };
  }

  private applyPortal(client: Pick<ClientDto, 'portalEnabled' | 'portalUrl'>) {
    this.portalEnabled.set(!!client.portalEnabled);
    this.portalUrl.set(client.portalUrl ?? null);
  }

  private buildPayload() {
    const emptyToUndefined = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      name: this.form.name.trim(),
      code: emptyToUndefined(this.form.code),
      journey: this.form.journey,
      tags: this.form.tags,
      email: emptyToUndefined(this.form.email),
      phone: emptyToUndefined(this.form.phone),
      address: emptyToUndefined(this.form.address),
      city: emptyToUndefined(this.form.city),
      state: emptyToUndefined(this.form.state),
      zip: emptyToUndefined(this.form.zip),
      website: emptyToUndefined(this.form.website),
      notes: richTextOrUndefined(this.form.notes),
      isActive: this.form.isActive,
    };
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    const params = this.route.snapshot.queryParamMap;
    if (params.get('from') === 'clients' || this.router.url.startsWith('/clients/')) {
      this.backLink = '/clients';
    }
    if (!id) {
      if (this.isClientFlow) {
        this.form.journey = 'CLIENT';
        this.newType = 'client';
      } else {
        const type = params.get('type') as NewOrgType | null;
        const journey = params.get('journey');
        this.setNewType(
          type && ['prospect', 'client', 'partner'].includes(type)
            ? type
            : journey === 'CLIENT'
              ? 'client'
              : 'prospect',
        );
      }
    }
    if (id) {
      this.id.set(id);
      try {
        const client = await this.api.get<ClientDto>(`/clients/${id}`);
        this.patchForm(client);
        this.applyPortal(client);
        await this.loadProjects();
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load client');
      }
    }
    this.loading.set(false);
  }

  private async loadProjects() {
    const clientId = this.id();
    if (!clientId) return;

    this.projectsLoading.set(true);
    try {
      const data = await this.api.get<ClientProject[]>(`/projects?clientId=${clientId}`);
      this.projects.set(data);
    } catch {
      this.projects.set([]);
    } finally {
      this.projectsLoading.set(false);
    }
  }

  async save() {
    if (!this.form.name) {
      this.error.set('Name is required');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const payload = this.buildPayload();
      if (this.isNew) {
        const created = await this.api.post<ClientDto>('/clients', payload);
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail:
            this.form.journey === 'PROSPECT'
              ? `${created.name} added, with a card in the first lane of the pipeline.`
              : `${created.name} added.`,
        });
        const detailPath = this.backLink === '/clients' ? '/clients' : '/organizations';
        await this.router.navigate([detailPath, created.id], { replaceUrl: true });
      } else {
        await this.api.put(`/clients/${this.id()}`, payload);
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `${this.form.name} saved.` });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** New-organization type: sets status, and the Partner tag for partners. */
  setNewType(type: NewOrgType) {
    this.newType = type;
    this.form.journey = type === 'prospect' ? 'PROSPECT' : type === 'client' ? 'CLIENT' : 'NONE';
    const others = this.form.tags.filter((t) => t.toLowerCase() !== 'partner');
    this.form.tags = type === 'partner' ? ['Partner', ...others] : others;
  }

  /** Projects and Client portal show only for clients (and past clients, who keep their projects). */
  get isClient(): boolean {
    return this.form.journey === 'CLIENT' || this.form.journey === 'PAST_CLIENT';
  }

  /** Page title. */
  get pageTitle(): string {
    if (!this.isNew) return this.form.name || 'Organization';
    return this.newType === 'client' ? 'New client' : 'New organization';
  }

  /** Flip a prospect or past client to Client. Copies nothing; reversible from the Journey field. */
  async makeClient() {
    const id = this.id();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.put(`/clients/${id}`, { journey: 'CLIENT' });
      this.form.journey = 'CLIENT';
      this.toast.add({
        severity: 'success',
        summary: 'Now a client',
        detail: `${this.form.name} is a client. Projects, time and invoices are available.`,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update');
    } finally {
      this.saving.set(false);
    }
  }

  async onPortalToggle(enabled: boolean) {
    if (this.isNew || this.portalBusy()) return;

    this.portalBusy.set(true);
    this.error.set(null);
    try {
      const path = enabled ? 'enable' : 'disable';
      const client = await this.api.post<ClientDto>(`/clients/${this.id()}/portal/${path}`, {});
      this.applyPortal(client);
      this.toast.add({
        severity: 'success',
        summary: enabled ? 'Portal enabled' : 'Portal disabled',
        detail: enabled
          ? 'Copy the portal link and send it to your client.'
          : 'The portal link no longer works.',
      });
    } catch (err) {
      this.portalEnabled.set(!enabled);
      this.error.set(err instanceof Error ? err.message : 'Portal update failed');
    } finally {
      this.portalBusy.set(false);
    }
  }

  confirmRegeneratePortalLink() {
    this.confirm.confirm({
      header: 'Regenerate portal link',
      message:
        'Generate a new portal link? The old link will stop working immediately.',
      accept: () => this.regeneratePortalLink(),
    });
  }

  private async regeneratePortalLink() {
    if (this.isNew || this.portalBusy()) return;

    this.portalBusy.set(true);
    this.error.set(null);
    try {
      const client = await this.api.post<ClientDto>(
        `/clients/${this.id()}/portal/regenerate`,
        {},
      );
      this.applyPortal(client);
      this.toast.add({
        severity: 'success',
        summary: 'Link regenerated',
        detail: 'Send the new portal link to your client.',
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to regenerate link');
    } finally {
      this.portalBusy.set(false);
    }
  }

  async copyPortalLink() {
    const url = this.portalUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: 'Portal link copied.' });
    } catch {
      this.toast.add({
        severity: 'warn',
        summary: 'Copy failed',
        detail: 'Select and copy the link manually.',
      });
    }
  }
}
