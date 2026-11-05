import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { MessageService } from 'primeng/api';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import type Quill from 'quill';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { PeopleComponent } from '../../ui/people/people.component';
import { TagInputComponent } from '../../ui/tag-input/tag-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { CareClientTabComponent } from '../../ui/care-forms/care-client-tab.component';
import { ClientFormsPanelComponent } from '../../ui/client-forms/client-forms-panel.component';
import { CareApi } from '../../core/care.api';
import {
  areaLevel,
  type AccountJourney,
  type CareClientOverviewDto,
  type ClientDto,
  type OrgFocusCategory,
  type RecordAttributionDto,
} from '@upstart/back-office/shared';
import { MultiSelectModule } from 'primeng/multiselect';
import { PIPELINE_CATEGORY_PRESETS } from '../../core/pipeline-vocabulary';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { PhoneInputComponent } from '../../ui/phone-input/phone-input.component';
import { ACCOUNT_JOURNEY_LABELS, US_STATES } from '@upstart/back-office/shared';

type ClientProject = {
  id: string;
  name: string;
  isBillable: boolean;
  isActive: boolean;
  hourlyRate?: number | null;
};

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
  services: string[];
  products: string[];
  focusCategories: OrgFocusCategory[];
  isPublicFeatured: boolean;
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
    MultiSelectModule,
    TableModule,
    TabsModule,
    TagModule,
    QuillModule,
    PageComponent,
    PhoneInputComponent,
    ArtifactsPanelComponent,
    ActivityTimelineComponent,
    PeopleComponent,
    TagInputComponent,
    HelpTextComponent,
    RecordAttributionComponent,
    CareClientTabComponent,
    ClientFormsPanelComponent,
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
  private readonly care = inject(CareApi);
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));

  readonly usStates = US_STATES;
  readonly focusCategoryOptions = PIPELINE_CATEGORY_PRESETS;
  /** Free-form lists; no CRM tag catalog. */
  readonly emptyTagSuggestions: string[] = [];
  readonly journeyOptions: { value: AccountJourney; label: string }[] = [
    { value: 'CLIENT', label: 'Client' },
    { value: 'NONE', label: 'Partner / other' },
  ];
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
  readonly attribution = signal<RecordAttributionDto | null>(null);

  /** Care module: the client's care status and forms (null when the user has no Care area). */
  readonly careOverview = signal<CareClientOverviewDto | null>(null);
  readonly inCare = computed(() => !!this.careOverview()?.careStatus);
  /** Details or Care (?tab=care opens Care). */
  readonly tab = signal<'details' | 'care'>('details');
  addingToCare = signal(false);

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
    services: [],
    products: [],
    focusCategories: [],
    isPublicFeatured: false,
    isActive: true,
  };

  get isNew() {
    return !this.id();
  }

  /** Form as last loaded or saved; Save stays off until something differs. */
  private savedSnapshot = '';

  private snapshot() {
    return JSON.stringify(this.form);
  }

  isDirty() {
    return this.snapshot() !== this.savedSnapshot;
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
      services: [...(client.services ?? [])],
      products: [...(client.products ?? [])],
      focusCategories: [...(client.focusCategories ?? [])],
      isPublicFeatured: !!client.isPublicFeatured,
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
      services: this.form.services,
      products: this.form.products,
      focusCategories: this.form.focusCategories,
      isPublicFeatured: this.form.isPublicFeatured,
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
      } else {
        const type = params.get('type');
        if (type === 'partner') {
          this.form.journey = 'NONE';
          this.form.tags = ['Partner'];
        } else {
          this.form.journey = 'CLIENT';
        }
      }
    }
    if (id) {
      this.id.set(id);
      try {
        const client = await this.api.get<ClientDto>(`/clients/${id}`);
        this.patchForm(client);
        this.attribution.set(client.attribution ?? null);
        this.savedSnapshot = this.snapshot();
        this.applyPortal(client);
        await Promise.all([this.loadProjects(), this.loadCare()]);
        if (params.get('tab') === 'care' && this.inCare()) this.tab.set('care');
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load client');
      }
    }
    this.loading.set(false);
  }

  /** Anyone with a Care area (Care forms, Visits or Schedule) gets the client's care overview. */
  private async loadCare() {
    const id = this.id();
    const me = this.session.me();
    if (!id || !(['care', 'visits', 'schedule'] as const).some((a) => !!areaLevel(me, a))) return;
    try {
      this.careOverview.set(await this.care.careClient(id));
    } catch {
      this.careOverview.set(null);
    }
  }

  setTab(value: string | number | undefined) {
    const tab = value === 'care' ? 'care' : 'details';
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'care' ? 'care' : null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Add to care: status Active, then open the Care tab. */
  async addToCare() {
    const id = this.id();
    if (!id || this.addingToCare()) return;
    this.addingToCare.set(true);
    try {
      this.careOverview.set(await this.care.setCareStatus(id, 'ACTIVE'));
      this.setTab('care');
      this.toast.add({ severity: 'success', summary: 'Added to care', detail: `${this.form.name} is in care.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add to care', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.addingToCare.set(false);
    }
  }

  /** The Care tab changed the status; taken out of care goes back to Details. */
  onCareChange(overview: CareClientOverviewDto) {
    this.careOverview.set(overview);
    if (!overview.careStatus) this.setTab('details');
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
          detail: `${created.name} added.`,
        });
        const detailPath = this.backLink === '/clients' ? '/clients' : '/organizations';
        await this.router.navigate([detailPath, created.id], { replaceUrl: true });
      } else {
        const updated = await this.api.put<ClientDto>(`/clients/${this.id()}`, payload);
        this.attribution.set(updated.attribution ?? null);
        this.savedSnapshot = this.snapshot();
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `${this.form.name} saved.` });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  /** Projects and Client portal show only for clients. */
  get isClient(): boolean {
    return this.form.journey === 'CLIENT';
  }

  /** Page title. */
  get pageTitle(): string {
    if (!this.isNew) return this.form.name || 'Organization';
    if (this.isClientFlow || this.form.journey === 'CLIENT') return 'New client';
    if (this.form.tags.some((t) => t.toLowerCase() === 'partner')) return 'New partner';
    return 'New organization';
  }

  /** Flip a prospect or other organization to Client. Copies nothing; reversible from the Status field. */
  async makeClient() {
    const id = this.id();
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.put(`/clients/${id}`, { journey: 'CLIENT' });
      this.form.journey = 'CLIENT';
      // Already saved: keep Save off for this change only.
      if (this.savedSnapshot) {
        this.savedSnapshot = JSON.stringify({ ...JSON.parse(this.savedSnapshot), journey: 'CLIENT' });
      }
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

  onNotesEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const clientId = this.id();
      return clientId ? { type: 'client', clientId } : { type: 'crm' };
    });
  }
}
