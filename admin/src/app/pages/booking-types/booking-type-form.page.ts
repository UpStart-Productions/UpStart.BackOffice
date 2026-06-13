import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { InputNumberModule } from 'primeng/inputnumber';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';

type BookingTypeDto = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  isActive: boolean;
  hostUserId: string;
  durationMin: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  timezone: string;
  publicPageUrl: string;
  calendarEventTitle: string;
  createLead: boolean;
  leadStage: string;
  leadSource: string;
  pipelineNoteTitle: string | null;
  priceCents: number | null;
  currency: string;
  isBillable: boolean;
  paymentRequired: boolean;
  bookingCount: number;
  availabilityRules: { dayOfWeek: number; startMinute: number; endMinute: number }[];
};

type HostOption = { id: string; label: string };

type DayRow = {
  dayOfWeek: number;
  label: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
};

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LEAD_STAGES = [
  'NEW_LEAD',
  'DISCOVERY',
  'PROPOSAL_SENT',
  'ACTIVE_CLIENT',
  'PAST_CLIENT',
  'ON_HOLD',
];

const LEAD_SOURCES = [
  'WARM_OUTREACH',
  'REFERRAL',
  'INBOUND',
  'EVENT',
  'SOCIAL',
  'COLD_OUTREACH',
];

const TIMEZONE_OPTIONS = [
  { label: 'America/LA (Pacific)', value: 'America/Los_Angeles' },
  { label: 'America/Denver (Mountain)', value: 'America/Denver' },
  { label: 'America/Chicago (Central)', value: 'America/Chicago' },
  { label: 'America/New York (Eastern)', value: 'America/New_York' },
  { label: 'America/Anchorage (Alaska)', value: 'America/Anchorage' },
  { label: 'Pacific/Honolulu (Hawaii)', value: 'Pacific/Honolulu' },
];

const DEFAULT_TIMEZONE = 'America/Los_Angeles';

@Component({
  selector: 'app-booking-type-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    MessageModule,
    SelectModule,
    TableModule,
    ToggleSwitchModule,
    PageComponent,
  ],
  templateUrl: './booking-type-form.page.html',
})
export class BookingTypeFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  bookingCount = signal(0);
  hostOptions = signal<HostOption[]>([]);

  readonly leadStages = LEAD_STAGES;
  readonly leadSources = LEAD_SOURCES;
  readonly timezoneOptions = TIMEZONE_OPTIONS;

  form = {
    slug: '',
    name: '',
    brand: '',
    isActive: true,
    hostUserId: '',
    durationMin: 30,
    minNoticeHours: 4,
    maxDaysAhead: 60,
    timezone: DEFAULT_TIMEZONE,
    publicPageUrl: '',
    calendarEventTitle: '',
    createLead: true,
    leadStage: 'DISCOVERY',
    leadSource: 'INBOUND',
    pipelineNoteTitle: '',
    priceDollars: null as number | null,
    currency: 'USD',
    isBillable: false,
    paymentRequired: false,
  };

  days: DayRow[] = DAY_LABELS.map((label, dayOfWeek) => ({
    dayOfWeek,
    label,
    enabled: false,
    startTime: '09:00',
    endTime: '17:00',
  }));

  async ngOnInit() {
    const paramId = this.route.snapshot.paramMap.get('id');
    if (paramId && paramId !== 'new') {
      this.id.set(paramId);
    }
    await this.loadHosts();
    if (this.id()) {
      await this.load();
    } else {
      this.loading.set(false);
    }
  }

  private async loadHosts() {
    try {
      const res = await this.api.get<{ users: { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null }[] }>('/users');
      this.hostOptions.set(
        res.users
          .filter((u) => u.id)
          .map((u) => ({
            id: u.id,
            label: u.name ?? ([u.firstName, u.lastName].filter(Boolean).join(' ') || u.email),
          })),
      );
    } catch {
      this.hostOptions.set([]);
    }
  }

  private async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.api.get<BookingTypeDto>(`/booking/admin/types/${this.id()}`);
      this.applyDto(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load booking type');
    } finally {
      this.loading.set(false);
    }
  }

  private applyDto(data: BookingTypeDto) {
    this.bookingCount.set(data.bookingCount);
    this.form = {
      slug: data.slug,
      name: data.name,
      brand: data.brand ?? '',
      isActive: data.isActive,
      hostUserId: data.hostUserId,
      durationMin: data.durationMin,
      minNoticeHours: data.minNoticeHours,
      maxDaysAhead: data.maxDaysAhead,
      timezone: data.timezone || DEFAULT_TIMEZONE,
      publicPageUrl: data.publicPageUrl,
      calendarEventTitle: data.calendarEventTitle,
      createLead: data.createLead,
      leadStage: data.leadStage,
      leadSource: data.leadSource,
      pipelineNoteTitle: data.pipelineNoteTitle ?? '',
      priceDollars:
        data.priceCents != null ? Number((data.priceCents / 100).toFixed(2)) : null,
      currency: data.currency,
      isBillable: data.isBillable,
      paymentRequired: data.paymentRequired,
    };
    this.days = DAY_LABELS.map((label, dayOfWeek) => {
      const rule = data.availabilityRules.find((r) => r.dayOfWeek === dayOfWeek);
      return {
        dayOfWeek,
        label,
        enabled: !!rule,
        startTime: rule ? this.minutesToTime(rule.startMinute) : '09:00',
        endTime: rule ? this.minutesToTime(rule.endMinute) : '17:00',
      };
    });
  }

  onBillableChange(billable: boolean) {
    if (!billable) {
      this.form.paymentRequired = false;
    }
  }

  async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      const availabilityRules = this.days
        .filter((d) => d.enabled)
        .map((d) => ({
          dayOfWeek: d.dayOfWeek,
          startMinute: this.timeToMinutes(d.startTime),
          endMinute: this.timeToMinutes(d.endTime),
        }));

      const { priceDollars, ...formFields } = this.form;
      const payload = {
        ...formFields,
        brand: this.form.brand.trim() || undefined,
        pipelineNoteTitle: this.form.pipelineNoteTitle.trim() || undefined,
        priceCents:
          this.form.isBillable && priceDollars != null
            ? Math.round(priceDollars * 100)
            : null,
        paymentRequired: this.form.isBillable && this.form.paymentRequired,
        availabilityRules,
      };

      if (this.id()) {
        await this.api.put(`/booking/admin/types/${this.id()}`, payload);
        this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Booking type updated.', life: 3000 });
        await this.load();
      } else {
        const created = await this.api.post<BookingTypeDto>('/booking/admin/types', payload);
        this.toast.add({ severity: 'success', summary: 'Created', detail: 'Booking type created.', life: 3000 });
        await this.router.navigate(['/bookings/types', created.id]);
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save booking type');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteType() {
    const id = this.id();
    if (!id) return;
    this.confirmDelete.confirm({
      message: `Delete "${this.form.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/booking/admin/types/${id}`);
          await this.router.navigate(['/bookings/types']);
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to delete booking type');
        }
      },
    });
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
}
