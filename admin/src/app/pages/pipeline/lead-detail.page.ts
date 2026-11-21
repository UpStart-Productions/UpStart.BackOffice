import { Location } from '@angular/common';
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import { ActivitySectionComponent } from '../../ui/activity/activity-section.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { MoneyInputComponent } from '../../ui/money-input/money-input.component';
import { PipelinesApi, PipelineSummary } from '../../core/pipelines.api';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PeopleComponent } from '../../ui/people/people.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import type { RecordAttributionDto } from '@upstart/back-office/shared';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { PhoneInputComponent } from '../../ui/phone-input/phone-input.component';
import { CreatableSelectComponent } from '../../ui/creatable-select/creatable-select.component';
import {
  mergeCreatableOptions,
  PIPELINE_NEXT_ACTION_PRESETS,
} from '../../core/pipeline-vocabulary';

/** Placeholder org name when a card is created opening New Lead (user replaces before Save). */
export const NEW_LEAD_PLACEHOLDER_ORG = 'Untitled organization';

import { LaneSelectComponent } from '../../ui/lane-select/lane-select.component';
import { DimensionsApi } from '../../core/dimensions.api';
import { CLIENT_DIMENSION_KEYS, LEAD_DIMENSION_KEYS } from '@upstart/back-office/shared';
const ADVANCED_OPEN_KEY = 'ubo.leadDetail.advancedOpen';

function readAdvancedOpen(): boolean {
  try {
    return localStorage.getItem(ADVANCED_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-lead-detail-page',
  standalone: true,
  imports: [
    AccordionModule,
    LaneSelectComponent,
    HelpTextComponent,
    PeopleComponent,
    RowActionsMenuComponent,
    PhoneInputComponent,
    CreatableSelectComponent,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    AppDialogModule,
    TagModule,
    PageComponent,
    ArtifactsPanelComponent,
    ActivitySectionComponent,
    DateInputComponent,
    MoneyInputComponent,
    RecordAttributionComponent,
  ],
  templateUrl: './lead-detail.page.html',
  styleUrl: './lead-detail.page.scss',
})
export class LeadDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private bootstrapInFlight = false;

  id = signal<string | null>(null);
  /** Advanced panel (source, category, services, dates, value): collapsed unless the user left it open. */
  readonly advancedOpen = signal<string | undefined>(readAdvancedOpen() ? 'advanced' : undefined);
  private readonly rememberAdvanced = effect(() => {
    try {
      localStorage.setItem(ADVANCED_OPEN_KEY, this.advancedOpen() === 'advanced' ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  });
  loading = signal(true);
  saving = signal(false);
  converting = signal(false);
  promoting = signal(false);
  error = signal<string | null>(null);
  showConvertDialog = signal(false);
  convertCode = '';
  account = signal<{ id: string; name: string; journey: string } | null>(null);
  contactId = signal<string | null>(null);
  contactAvatarUrl = signal<string | null>(null);
  primaryContactName = signal('');
  /** The card's contact as text (name, email, phone) when no person is linked, for example from a website form. */
  unlinkedContact = computed(() => {
    const name = (this.savedName() || this.primaryContactName()).trim();
    if (this.contactId() || !name) return null;
    return { name, email: this.savedEmail() || null, phone: this.savedPhone() };
  });
  private readonly savedName = signal('');
  private readonly savedEmail = signal('');
  private readonly savedPhone = signal<string | null>(null);
  primaryContactEmail = signal<string | null>(null);
  warmConnectionContactId = signal<string | null>(null);

  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly session = inject(SessionService);
  readonly canEdit = computed(() => this.session.can('pipeline', 'edit'));
  readonly canDelete = computed(() => this.session.can('pipeline', 'delete'));
  pipelines = signal<PipelineSummary[]>([]);
  pipelineId = signal<string | null>(null);
  readonly stages = computed(() =>
    (this.pipelines().find((p) => p.id === this.pipelineId()) ?? this.pipelines()[0])?.stages.map((s) => ({ label: s.name, value: s.id })) ?? [],
  );
  /** Contact sources from Settings → Pick lists → Pipeline, plus the card's own if it isn't in the list. */
  readonly sources = computed(() => pickOptions(this.dimensions.values('LEAD', LEAD_DIMENSION_KEYS.sources), this.savedSource()));
  /** The saved source and category (signals, so the option lists keep a value that left its pick list). */
  private readonly savedSource = signal<string | null>(null);
  private readonly savedCategory = signal<string | null>(null);
  private readonly dimensions = inject(DimensionsApi);
  /** Services from Settings → Pick lists → Services, plus any the card already has that aren't in the list. */
  readonly serviceOptions = computed(() => {
    const def = this.dimensions.definitions('CLIENT')?.find((d) => d.key === CLIENT_DIMENSION_KEYS.services);
    const list = [...(def?.presets ?? [])];
    for (const picked of this.serviceInterests()) {
      if (!list.some((s) => s.toLowerCase() === picked.toLowerCase())) list.push(picked);
    }
    return list;
  });
  serviceInterests = signal<string[]>([]);
  readonly attribution = signal<RecordAttributionDto | null>(null);

  readonly tenantSuggestions = signal<{ categories: string[]; nextActions: string[] }>({
    categories: [],
    nextActions: [],
  });
  /** Categories are the Focus areas pick list (Settings → Pick lists → Accounts), plus the card's own if it isn't in it. */
  readonly categoryOptions = computed(() => pickOptions(this.dimensions.values('CLIENT', CLIENT_DIMENSION_KEYS.focus), this.savedCategory()));
  readonly nextActionOptions = computed(() =>
    mergeCreatableOptions(PIPELINE_NEXT_ACTION_PRESETS, this.tenantSuggestions().nextActions),
  );

  readonly orgClientId = computed(() => this.account()?.id ?? null);

  form = {
    organization: '',
    contactFirstName: '',
    contactLastName: '',
    email: '',
    phone: null as string | null,
    website: '',
    stageId: '' as string | null,
    source: '' as string | null,
    category: '' as string | null,
    nextAction: '' as string | null,
    nextActionDate: '',
    lastContactDate: '',
    estimatedValue: null as number | null,
    expectedCloseDate: '',
  };

  private savedSnapshot = '';

  get isNew() { return !this.id(); }

  get pageTitle(): string {
    const org = this.form.organization.trim();
    if (!org || org === NEW_LEAD_PLACEHOLDER_ORG) return 'New Lead';
    return org;
  }

  private snapshot() {
    return JSON.stringify({
      form: this.form,
      services: this.serviceInterests(),
      warmConnectionContactId: this.warmConnectionContactId(),
    });
  }

  isDirty() {
    return this.snapshot() !== this.savedSnapshot;
  }

  /** The ⋮ menu attached to Save: Make client, Make partner, then Delete. A method: it reads isConverted (a getter). */
  headerMenu(): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (this.id() && !this.isConverted && this.canEdit()) {
      actions.push({ id: 'client', label: 'Make client', icon: 'pi pi-check', command: () => this.showConvertDialog.set(true) });
      if (!this.orgClientId()) {
        actions.push({ id: 'partner', label: 'Make partner', icon: 'pi pi-users', disabled: this.promoting(), command: () => void this.promotePartner() });
      }
    }
    if (this.canDelete()) {
      if (actions.length) actions.push({ id: 'sep', kind: 'separator' });
      actions.push({
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDeleteLead(),
      });
    }
    return actions;
  }
  get isConverted() { return this.account()?.journey === 'CLIENT'; }

  private patchForm(lead: Record<string, unknown>) {
    const toDateStr = (v: unknown) =>
      v ? new Date(v as string).toISOString().split('T')[0] : '';

    this.savedSource.set((lead['source'] as string) ?? null);
    this.savedCategory.set((lead['category'] as string) ?? null);
    this.form = {
      organization: (lead['organization'] as string) ?? '',
      contactFirstName: (lead['contactFirstName'] as string | null) ?? '',
      contactLastName: (lead['contactLastName'] as string | null) ?? '',
      email: (lead['email'] as string) ?? '',
      phone: (lead['phone'] as string | null) ?? null,
      website: (lead['website'] as string) ?? '',
      stageId: (lead['stageId'] as string) ?? null,
      source: (lead['source'] as string) ?? null,
      category: (lead['category'] as string) ?? null,
      nextAction: (lead['nextAction'] as string) ?? null,
      nextActionDate: toDateStr(lead['nextActionDate']),
      lastContactDate: toDateStr(lead['lastContactDate']),
      estimatedValue: lead['estimatedValue'] == null ? null : Number(lead['estimatedValue']),
      expectedCloseDate: toDateStr(lead['expectedCloseDate']),
    };
    this.account.set((lead['client'] as { id: string; name: string; journey: string } | null) ?? null);
    this.contactId.set((lead['primaryContactId'] as string) ?? null);
    this.contactAvatarUrl.set((lead['contactAvatarUrl'] as string) ?? null);
    this.primaryContactName.set((lead['primaryContact'] as string) ?? '');
    this.primaryContactEmail.set((lead['primaryContactEmail'] as string) ?? null);
    this.savedName.set([lead['contactFirstName'], lead['contactLastName']].filter(Boolean).join(' '));
    this.savedEmail.set((lead['email'] as string) ?? '');
    this.savedPhone.set((lead['phone'] as string | null) ?? null);
    this.warmConnectionContactId.set((lead['warmConnectionContactId'] as string) ?? null);
    this.pipelineId.set((lead['pipelineId'] as string) ?? null);
    this.serviceInterests.set((lead['serviceInterests'] as string[]) ?? []);
    this.attribution.set((lead['attribution'] as RecordAttributionDto | undefined) ?? null);
  }

  /** Primary / warm panels persist via their own API calls — do not overwrite unsaved main-form fields. */
  onLeadContactPanelUpdated(lead: Record<string, unknown>) {
    this.contactId.set((lead['primaryContactId'] as string) ?? null);
    // The name fields follow the linked person (or the card's own name again once unlinked).
    this.form.contactFirstName = (lead['contactFirstName'] as string | null) ?? '';
    this.form.contactLastName = (lead['contactLastName'] as string | null) ?? '';
    this.savedName.set([lead['contactFirstName'], lead['contactLastName']].filter(Boolean).join(' '));
    this.contactAvatarUrl.set((lead['contactAvatarUrl'] as string) ?? null);
    this.primaryContactName.set((lead['primaryContact'] as string) ?? '');
    this.primaryContactEmail.set((lead['primaryContactEmail'] as string) ?? null);
    this.warmConnectionContactId.set((lead['warmConnectionContactId'] as string) ?? null);
  }

  private buildPayload() {
    /** Empty optional fields must be `null` — `undefined` is omitted from JSON and the API keeps the old value. */
    const opt = (v: string | null | undefined) => {
      if (v == null) return null;
      const t = v.trim();
      return t || null;
    };
    const optDate = (v: string) => (v.trim() ? v.trim() : null);
    return {
      organization: this.form.organization.trim(),
      // The card's own contact; the API ignores these while a person is linked (their name wins).
      ...(this.contactId() ? {} : { contactFirstName: opt(this.form.contactFirstName), contactLastName: opt(this.form.contactLastName) }),
      email: opt(this.form.email),
      phone: opt(this.form.phone),
      website: opt(this.form.website),
      stageId: this.form.stageId || null,
      source: this.form.source || null,
      category: opt(this.form.category),
      serviceInterests: this.serviceInterests(),
      nextAction: opt(this.form.nextAction),
      nextActionDate: optDate(this.form.nextActionDate),
      lastContactDate: optDate(this.form.lastContactDate),
      estimatedValue: this.form.estimatedValue,
      expectedCloseDate: optDate(this.form.expectedCloseDate),
      warmConnectionContactId: this.warmConnectionContactId(),
    };
  }

  async ngOnInit() {
    void this.dimensions.loadClientDefinitions().catch(() => undefined);
    void this.dimensions.loadLeadDefinitions().catch(() => undefined);
    try {
      this.pipelines.set(await this.pipelinesApi.list());
    } catch {
      /* the lane picker just stays empty */
    }
    try {
      const meta = await this.api.get<{ categories: string[]; nextActions: string[] }>('/leads/meta/suggestions');
      this.tenantSuggestions.set(meta);
    } catch {
      /* presets only */
    }
    const startPipeline = this.route.snapshot.queryParamMap.get('pipelineId');
    if (startPipeline) {
      this.pipelineId.set(startPipeline);
    } else if (this.pipelines()[0]?.id) {
      this.pipelineId.set(this.pipelines()[0].id);
    }
    const paramId = this.route.snapshot.paramMap.get('id');
    if (paramId === 'new') {
      this.loading.set(false);
      await this.bootstrapNewLead();
    } else if (paramId) {
      this.id.set(paramId);
      try {
        const lead = await this.api.get<Record<string, unknown>>(`/leads/${paramId}`);
        this.patchForm(lead);
        this.savedSnapshot = this.snapshot();
        if (this.route.snapshot.queryParamMap.get('convert') === '1') {
          this.showConvertDialog.set(true);
        }
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load lead');
      }
      this.loading.set(false);
    } else {
      this.loading.set(false);
    }
  }

  /** Route param (still `new` until we replaceState after bootstrap). */
  routeId(): string | null {
    return this.route.snapshot.paramMap.get('id');
  }

  /** Create the card once when opening New Lead; keep this component mounted (no route swap). */
  private async bootstrapNewLead() {
    if (this.id() || this.bootstrapInFlight) return;
    this.bootstrapInFlight = true;
    this.error.set(null);
    try {
      const payload: Record<string, unknown> = { organization: NEW_LEAD_PLACEHOLDER_ORG };
      const pid = this.pipelineId();
      if (pid) payload['pipelineId'] = pid;
      const stageId = this.form.stageId || this.stages()[0]?.value;
      if (stageId) payload['stageId'] = stageId;
      const lead = await this.api.post<Record<string, unknown>>('/leads', payload);
      const leadId = lead['id'] as string;
      if (!leadId) throw new Error('Could not start a new lead');
      this.id.set(leadId);
      this.patchForm(lead);
      if (this.form.organization === NEW_LEAD_PLACEHOLDER_ORG) {
        this.form.organization = '';
      }
      this.savedSnapshot = this.snapshot();
      const urlTree = this.router.createUrlTree(['/pipeline', leadId], {
        queryParams: this.route.snapshot.queryParams,
      });
      this.location.replaceState(this.router.serializeUrl(urlTree));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not start a new lead');
    } finally {
      this.bootstrapInFlight = false;
    }
  }

  async retryBootstrap() {
    await this.bootstrapNewLead();
  }

  toggleServiceInterest(service: string) {
    this.serviceInterests.update((current) =>
      current.includes(service)
        ? current.filter((s) => s !== service)
        : [...current, service],
    );
  }

  async save() {
    const org = this.form.organization.trim();
    if (!org || org === NEW_LEAD_PLACEHOLDER_ORG) {
      this.error.set('Account name is required');
      return;
    }
    const leadId = this.id();
    if (!leadId) {
      this.error.set('Lead is not ready yet');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.api.put<{ attribution?: RecordAttributionDto } & Record<string, unknown>>(
        `/leads/${leadId}`,
        this.buildPayload(),
      );
      this.patchForm(updated);
      if (updated?.attribution) {
        this.attribution.set(updated.attribution);
      }
      this.savedSnapshot = this.snapshot();
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Lead saved successfully.',
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteLead() {
    const id = this.id();
    if (!id) return;
    const name = this.form.organization.trim() || 'this entry';
    this.confirmDelete.confirm({
      message: `Delete "${name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/leads/${id}`);
          await this.router.navigate(['/pipeline']);
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }

  async promotePartner() {
    this.promoting.set(true);
    this.error.set(null);
    try {
      const client = await this.api.post<{ id: string }>(`/leads/${this.id()}/promote-partner`, {});
      this.toast.add({ severity: 'success', summary: 'Partner added', detail: 'The account is on your list; the card leaves the board.' });
      await this.router.navigate(['/accounts', client.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not add partner');
    } finally {
      this.promoting.set(false);
    }
  }

  async convertToClient() {
    this.converting.set(true);
    this.error.set(null);
    try {
      const code = this.convertCode.trim();
      const client = await this.api.post<{ id: string }>(
        `/leads/${this.id()}/convert`,
        code ? { code } : {},
      );
      this.showConvertDialog.set(false);
      this.router.navigate(['/accounts', client.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Conversion failed');
    } finally { this.converting.set(false); }
  }
}

/** Select options from a pick list, keeping a saved value that's no longer in the list so it still shows. */
function pickOptions(values: string[], current: string | null | undefined): { label: string; value: string }[] {
  const list = [...values];
  if (current && !list.some((v) => v.toLowerCase() === current.toLowerCase())) list.push(current);
  return list.map((v) => ({ label: v, value: v }));
}
