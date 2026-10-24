import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TagModule } from 'primeng/tag';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import { ActivityTimelineComponent } from '../../ui/activity/activity-timeline.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { PipelinesApi, PipelineSummary } from '../../core/pipelines.api';
import { PersonComponent } from '../../ui/person/person.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

const SOURCES = [
  { label: 'Warm Outreach', value: 'WARM_OUTREACH' },
  { label: 'Referral',      value: 'REFERRAL' },
  { label: 'Inbound',       value: 'INBOUND' },
  { label: 'Event',         value: 'EVENT' },
  { label: 'Social',        value: 'SOCIAL' },
  { label: 'Cold Outreach', value: 'COLD_OUTREACH' },
];

const CATEGORIES = [
  { label: 'Recovery',        value: 'RECOVERY' },
  { label: 'Family',          value: 'FAMILY' },
  { label: 'Youth',           value: 'YOUTH' },
  { label: 'Faith',           value: 'FAITH' },
  { label: 'Health',          value: 'HEALTH' },
  { label: 'Disability',      value: 'DISABILITY' },
  { label: 'Education',       value: 'EDUCATION' },
  { label: 'Jobs / Workforce',value: 'JOBS_WORKFORCE' },
  { label: 'Pets',            value: 'PETS' },
  { label: 'Funding',         value: 'FUNDING' },
  { label: 'Hunger',          value: 'HUNGER' },
  { label: 'Violence',        value: 'VIOLENCE' },
  { label: 'Activities',      value: 'ACTIVITIES' },
  { label: 'Other',           value: 'OTHER' },
];

const SERVICE_OPTIONS = [
  'GrovLink', 'Custom App', 'Website', 'Consulting',
  'Tech Assessment', 'IT Recruiting', 'Informational Interview',
];

@Component({
  selector: 'app-lead-detail-page',
  standalone: true,
  imports: [HelpTextComponent, PersonComponent, 
    FormsModule, RouterLink,
    ButtonModule, InputTextModule, MessageModule, TextareaModule,
    SelectModule, AppDialogModule, TagModule,
    PageComponent, ArtifactsPanelComponent, ActivityTimelineComponent, DateInputComponent,
  ],
  templateUrl: './lead-detail.page.html',
  styleUrl: './lead-detail.page.scss',
})
export class LeadDetailPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  converting = signal(false);
  error = signal<string | null>(null);
  showConvertDialog = signal(false);
  convertCode = '';
  /** The Account this pipeline item belongs to, and the person on it. */
  account = signal<{ id: string; name: string; journey: string } | null>(null);
  contactId = signal<string | null>(null);
  contactAvatarUrl = signal<string | null>(null);

  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly session = inject(SessionService);
  readonly canEdit = computed(() => this.session.can('pipeline', 'edit'));
  pipelines = signal<PipelineSummary[]>([]);
  pipelineId = signal<string | null>(null);
  archivedAt = signal<string | null>(null);
  /** Lanes of the card's pipeline, for the Lane picker. */
  readonly stages = computed(() =>
    (this.pipelines().find((p) => p.id === this.pipelineId()) ?? this.pipelines()[0])?.stages.map((s) => ({ label: s.name, value: s.id })) ?? [],
  );
  readonly sources = [...SOURCES].sort((a, b) => a.label.localeCompare(b.label));
  readonly categories = [...CATEGORIES].sort((a, b) => a.label.localeCompare(b.label));
  readonly serviceOptions = SERVICE_OPTIONS;
  serviceInterests = signal<string[]>([]);

  form = {
    organization: '',
    primaryContact: '',
    contactRole: '',
    email: '',
    phone: '',
    website: '',
    stageId: '' as string | null,
    source: '' as string | null,
    warmConnection: '',
    category: '' as string | null,
    nextAction: '',
    nextActionDate: '',
    lastContactDate: '',
  };

  get isNew() { return !this.id(); }
  get isConverted() { return this.account()?.journey === 'CLIENT'; }

  private patchForm(lead: Record<string, unknown>) {
    const toDateStr = (v: unknown) =>
      v ? new Date(v as string).toISOString().split('T')[0] : '';

    this.form = {
      organization:    (lead['organization'] as string) ?? '',
      primaryContact:  (lead['primaryContact'] as string) ?? '',
      contactRole:     (lead['contactRole'] as string) ?? '',
      email:           (lead['email'] as string) ?? '',
      phone:           (lead['phone'] as string) ?? '',
      website:         (lead['website'] as string) ?? '',
      stageId:         (lead['stageId'] as string) ?? null,
      source:          (lead['source'] as string) ?? null,
      warmConnection:  (lead['warmConnection'] as string) ?? '',
      category:        (lead['category'] as string) ?? null,
      nextAction:      (lead['nextAction'] as string) ?? '',
      nextActionDate:  toDateStr(lead['nextActionDate']),
      lastContactDate: toDateStr(lead['lastContactDate']),
    };
    this.account.set((lead['client'] as { id: string; name: string; journey: string } | null) ?? null);
    this.contactId.set((lead['primaryContactId'] as string) ?? null);
    this.contactAvatarUrl.set((lead['contactAvatarUrl'] as string) ?? null);
    this.pipelineId.set((lead['pipelineId'] as string) ?? null);
    this.archivedAt.set((lead['archivedAt'] as string) ?? null);
    this.serviceInterests.set((lead['serviceInterests'] as string[]) ?? []);
  }

  private buildPayload() {
    const e = (v: string) => v.trim() || undefined;
    return {
      organization:    this.form.organization.trim(),
      primaryContact:  e(this.form.primaryContact),
      contactRole:     e(this.form.contactRole),
      email:           e(this.form.email),
      phone:           e(this.form.phone),
      website:         e(this.form.website),
      stageId:         this.form.stageId || undefined,
      ...(this.isNew && this.pipelineId() ? { pipelineId: this.pipelineId()! } : {}),
      source:          this.form.source || undefined,
      warmConnection:  e(this.form.warmConnection),
      category:        this.form.category || undefined,
      serviceInterests: this.serviceInterests(),
      nextAction:      e(this.form.nextAction),
      nextActionDate:  this.form.nextActionDate || undefined,
      lastContactDate: this.form.lastContactDate || undefined,
    };
  }

  async ngOnInit() {
    try {
      this.pipelines.set(await this.pipelinesApi.list());
    } catch {
      /* the lane picker just stays empty */
    }
    const startPipeline = this.route.snapshot.queryParamMap.get('pipelineId');
    if (startPipeline) this.pipelineId.set(startPipeline);
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.id.set(id);
      try {
        const lead = await this.api.get<Record<string, unknown>>(`/leads/${id}`);
        this.patchForm(lead);
        if (this.route.snapshot.queryParamMap.get('convert') === '1') {
          this.showConvertDialog.set(true);
        }
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load lead');
      }
    }
    this.loading.set(false);
  }

  toggleServiceInterest(service: string) {
    this.serviceInterests.update((current) =>
      current.includes(service)
        ? current.filter((s) => s !== service)
        : [...current, service],
    );
  }

  async save() {
    if (!this.form.organization) { this.error.set('Organization name is required'); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.isNew) {
        const lead = await this.api.post<{ id: string }>('/leads', this.buildPayload());
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Lead created successfully.',
        });
        await this.router.navigate(['/pipeline', lead.id], { replaceUrl: true });
      } else {
        await this.api.put(`/leads/${this.id()}`, this.buildPayload());
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Lead saved successfully.',
        });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally { this.saving.set(false); }
  }

  /** Take the card off the board (history kept), or put it back. */
  async toggleArchive() {
    const id = this.id();
    if (!id) return;
    const archiving = !this.archivedAt();
    try {
      await this.api.post(`/leads/${id}/${archiving ? 'archive' : 'restore'}`, {});
      this.archivedAt.set(archiving ? new Date().toISOString() : null);
      this.toast.add({
        severity: 'success',
        summary: archiving ? 'Archived' : 'Restored',
        detail: archiving ? 'Off the board. Find it under Archived on the Pipeline.' : 'Back on the board.',
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update');
    }
  }

  /** Make the lead's Account a client. Nothing is copied; the invoice code is optional. */
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
      this.router.navigate(['/organizations', client.id]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Conversion failed');
    } finally { this.converting.set(false); }
  }
}
