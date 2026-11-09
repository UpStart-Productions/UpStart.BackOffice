import { Component, computed, inject, OnInit, signal, viewChild, viewChildren } from '@angular/core';
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
import { ActivitySectionComponent } from '../../ui/activity/activity-section.component';
import { PeopleComponent } from '../../ui/people/people.component';
import { TagInputComponent } from '../../ui/tag-input/tag-input.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { CareClientTabComponent } from '../../ui/care-forms/care-client-tab.component';
import { ClientFormsPanelComponent } from '../../ui/client-forms/client-forms-panel.component';
import { CareApi } from '../../core/care.api';
import {
  areaLevel,
  CLIENT_DIMENSION_KEYS,
  type AccountJourney,
  type CareClientOverviewDto,
  type ClientDto,
  type DimensionDefinitionDto,
  type RecordAttributionDto,
} from '@upstart/back-office/shared';
import { DimensionsApi } from '../../core/dimensions.api';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import {
  RowActionsMenuComponent,
  type RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import { AddToPipelineDialogComponent } from '../../ui/add-to-pipeline-dialog/add-to-pipeline-dialog.component';
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
  dimensions: Record<string, string[]>;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  website: string;
  linkedInUrl: string;
  notes: string;
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
    TableModule,
    TabsModule,
    TagModule,
    QuillModule,
    PageComponent,
    PhoneInputComponent,
    ArtifactsPanelComponent,
    ActivitySectionComponent,
    PeopleComponent,
    TagInputComponent,
    HelpTextComponent,
    RecordAttributionComponent,
    CareClientTabComponent,
    ClientFormsPanelComponent,
    RowActionsMenuComponent,
    AddToPipelineDialogComponent,
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
  private readonly dimensionsApi = inject(DimensionsApi);
  private readonly crmTags = inject(CrmTagsApi);
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));
  private readonly pipelineDialog = viewChild(AddToPipelineDialogComponent);
  private readonly tagFields = viewChildren(TagInputComponent);

  readonly canAddToPipeline = computed(
    () => this.session.can('pipeline', 'create') && this.session.can('clients', 'edit'),
  );

  readonly clientPipelineBase = computed(() => {
    const id = this.id();
    return id ? `/clients/${id}` : '';
  });

  /** The ⋮ menu attached to Save (or on its own on the Care tab). A method: it reads the plain form object. */
  headerMenu(): RowActionItem[] {
    if (this.isNew) return [];
    const items: RowActionItem[] = [];
    if (this.form.journey !== 'CLIENT' && this.canEdit()) {
      items.push({ id: 'make-client', label: 'Make client', icon: 'pi pi-check', disabled: this.saving(), command: () => void this.makeClient() });
    }
    if (this.isClient && this.careOverview()?.canManage && !this.inCare()) {
      items.push({ id: 'care', label: 'Add to care', icon: 'pi pi-heart', disabled: this.addingToCare(), command: () => void this.addToCare() });
    }
    if (this.canAddToPipeline()) {
      if (items.length) items.push({ id: 'sep', kind: 'separator' });
      items.push({ id: 'pipeline', label: 'Add to pipeline', icon: 'pi pi-share-alt', command: () => void this.pipelineDialog()?.open() });
    }
    return items;
  }

  readonly usStates = US_STATES;
  readonly clientDimensionDefs = signal<DimensionDefinitionDto[]>([]);
  readonly dimensionHelpKey: Record<string, string> = {
    tags: 'organization.tags',
    services: 'organization.services',
    products: 'organization.products',
    focus: 'organization.focusAreas',
  };
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
    dimensions: {
      [CLIENT_DIMENSION_KEYS.tags]: [],
      [CLIENT_DIMENSION_KEYS.services]: [],
      [CLIENT_DIMENSION_KEYS.products]: [],
      [CLIENT_DIMENSION_KEYS.focus]: [],
    },
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    website: '',
    linkedInUrl: '',
    notes: '',
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
      dimensions: {
        [CLIENT_DIMENSION_KEYS.tags]: [...(client.dimensions?.[CLIENT_DIMENSION_KEYS.tags] ?? [])],
        [CLIENT_DIMENSION_KEYS.services]: [...(client.dimensions?.[CLIENT_DIMENSION_KEYS.services] ?? [])],
        [CLIENT_DIMENSION_KEYS.products]: [...(client.dimensions?.[CLIENT_DIMENSION_KEYS.products] ?? [])],
        [CLIENT_DIMENSION_KEYS.focus]: [...(client.dimensions?.[CLIENT_DIMENSION_KEYS.focus] ?? [])],
      },
      email: this.str(client.email),
      phone: this.str(client.phone),
      address: this.str(client.address),
      city: this.str(client.city),
      state: this.str(client.state),
      zip: this.str(client.zip),
      website: this.str(client.website),
      linkedInUrl: this.str(client.linkedInUrl),
      notes: this.str(client.notes),
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
      dimensions: this.form.dimensions,
      email: emptyToUndefined(this.form.email),
      phone: emptyToUndefined(this.form.phone),
      address: emptyToUndefined(this.form.address),
      city: emptyToUndefined(this.form.city),
      state: emptyToUndefined(this.form.state),
      zip: emptyToUndefined(this.form.zip),
      website: emptyToUndefined(this.form.website),
      linkedInUrl: emptyToUndefined(this.form.linkedInUrl),
      notes: richTextOrUndefined(this.form.notes),
      isPublicFeatured: this.form.isPublicFeatured,
      isActive: this.form.isActive,
    };
  }

  /** Suggestions in the dropdown (focus presets, CRM catalog for tags, etc.). */
  dimensionPresets(def: DimensionDefinitionDto): string[] {
    const base = def.presets ?? [];
    if (def.key !== CLIENT_DIMENSION_KEYS.tags) return base;
    const seen = new Set(base.map((n) => n.toLowerCase()));
    const merged = [...base];
    for (const name of this.crmTags.names()) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(name);
      }
    }
    return merged;
  }

  dimensionRows(): DimensionDefinitionDto[][] {
    const defs = this.clientDimensionDefs();
    const rows: DimensionDefinitionDto[][] = [];
    for (let i = 0; i < defs.length; i += 2) rows.push(defs.slice(i, i + 2));
    return rows;
  }

  dimensionPlaceholder(def: DimensionDefinitionDto): string {
    if (def.key === CLIENT_DIMENSION_KEYS.tags) return 'Add a tag…';
    if (def.key === CLIENT_DIMENSION_KEYS.services) return 'Add a service…';
    if (def.key === CLIENT_DIMENSION_KEYS.products) return 'Add a product…';
    return 'Add a focus area…';
  }

  dimensionCreateKind(def: DimensionDefinitionDto): string {
    if (def.key === CLIENT_DIMENSION_KEYS.tags) return 'tag';
    if (def.key === CLIENT_DIMENSION_KEYS.services) return 'service';
    if (def.key === CLIENT_DIMENSION_KEYS.products) return 'product';
    return 'focus area';
  }

  async ngOnInit() {
    try {
      void this.crmTags.load();
      const defs = await this.dimensionsApi.loadClientDefinitions(true);
      this.clientDimensionDefs.set(defs);
      for (const def of defs) {
        if (!this.form.dimensions[def.key]) this.form.dimensions[def.key] = [];
      }
    } catch {
      this.clientDimensionDefs.set([]);
    }
    const id = this.route.snapshot.paramMap.get('id');
    const params = this.route.snapshot.queryParamMap;
    if (params.get('from') === 'clients' || this.router.url.startsWith('/clients/')) {
      this.backLink = '/clients';
    }
    if (!id) {
      if (this.isClientFlow) {
        this.form.journey = 'CLIENT';
      } else {
        this.form.journey = 'NONE';
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
      for (const field of this.tagFields()) field.commitPendingQuery();
      const payload = this.buildPayload();
      if (this.isNew) {
        const created = await this.api.post<ClientDto>('/clients', payload);
        await this.dimensionsApi.reloadClientDefinitions();
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: `${created.name} added.`,
        });
        const detailPath = this.backLink === '/clients' ? '/clients' : '/organizations';
        await this.router.navigate([detailPath, created.id], { replaceUrl: true });
      } else {
        const updated = await this.api.put<ClientDto>(`/clients/${this.id()}`, payload);
        this.patchForm(updated);
        this.clientDimensionDefs.set(await this.dimensionsApi.reloadClientDefinitions());
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
    if (this.isClientFlow) return 'New client';
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
