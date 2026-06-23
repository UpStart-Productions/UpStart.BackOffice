import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

type BookingTypeRow = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  isActive: boolean;
  durationMin: number;
  publicPageUrl: string;
  bookingCount: number;
};

type TypeBookingRow = {
  id: string;
  startAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestEmail: string;
  guestOrg: string | null;
  lead: { id: string; organization: string; stage: string } | null;
};

type BookingTypeDetail = {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  isActive: boolean;
  hostName?: string | null;
  hostEmail: string;
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

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

@Component({
  selector: 'app-booking-types-list-panel',
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    DialogModule,
    TableModule,
    MessageModule,
    TagModule,
    RowActionsMenuComponent,
  ],
  templateUrl: './booking-types-list-panel.component.html',
  styles: [
    `
      .booking-type-name-btn {
        padding: 0;
        border: none;
        background: none;
        font: inherit;
        font-weight: 600;
        color: var(--p-primary-color);
        cursor: pointer;
        text-align: left;
      }

      .booking-type-name-btn:hover {
        text-decoration: underline;
      }

      .type-detail-grid {
        display: grid;
        grid-template-columns: minmax(8rem, 11rem) 1fr;
        gap: 0.5rem 1.25rem;
        margin: 0;
      }

      .type-detail-grid dt {
        margin: 0;
        font-weight: 500;
        color: var(--text-color-secondary);
      }

      .type-detail-grid dd {
        margin: 0;
      }

      .type-detail-section {
        margin-bottom: 1.25rem;
      }

      .type-detail-section:last-child {
        margin-bottom: 0;
      }

      .type-detail-section-title {
        font-size: 0.875rem;
        font-weight: 600;
        margin: 0 0 0.75rem;
        color: var(--text-color);
      }

      .type-detail-availability {
        margin: 0;
        padding-left: 1.25rem;
      }
    `,
  ],
})
export class BookingTypesListPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly router = inject(Router);

  types = signal<BookingTypeRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  viewBookingsType = signal<BookingTypeRow | null>(null);
  showViewBookingsDialog = signal(false);
  viewBookings = signal<TypeBookingRow[]>([]);
  viewBookingsLoading = signal(false);
  viewBookingsError = signal<string | null>(null);

  showTypeDetailsDialog = signal(false);
  typeDetails = signal<BookingTypeDetail | null>(null);
  typeDetailsLoading = signal(false);
  typeDetailsError = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.api.get<BookingTypeRow[]>('/booking/admin/types');
      this.types.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load booking types');
    } finally {
      this.loading.set(false);
    }
  }

  getRowActions(row: BookingTypeRow): RowActionItem[] {
    return [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => void this.router.navigate(['/bookings/types', row.id]),
      },
      {
        id: 'view-bookings',
        label: 'View Bookings',
        icon: 'pi pi-calendar',
        command: () => void this.openViewBookings(row),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDeleteType(row),
      },
    ];
  }

  async openTypeDetails(row: BookingTypeRow) {
    this.showTypeDetailsDialog.set(true);
    this.typeDetailsLoading.set(true);
    this.typeDetailsError.set(null);
    this.typeDetails.set(null);
    try {
      const data = await this.api.get<BookingTypeDetail>(`/booking/admin/types/${row.id}`);
      this.typeDetails.set(data);
    } catch (err) {
      this.typeDetailsError.set(err instanceof Error ? err.message : 'Failed to load booking type');
    } finally {
      this.typeDetailsLoading.set(false);
    }
  }

  closeTypeDetails() {
    this.showTypeDetailsDialog.set(false);
    this.typeDetails.set(null);
    this.typeDetailsError.set(null);
  }

  editTypeDetails() {
    const detail = this.typeDetails();
    if (!detail) return;
    this.closeTypeDetails();
    void this.router.navigate(['/bookings/types', detail.id]);
  }

  formatAvailabilityRules(rules: BookingTypeDetail['availabilityRules']): string[] {
    return rules
      .slice()
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
      .map(
        (rule) =>
          `${DAY_LABELS[rule.dayOfWeek] ?? 'Day'}: ${this.minutesToTime(rule.startMinute)} – ${this.minutesToTime(rule.endMinute)}`,
      );
  }

  formatPrice(detail: BookingTypeDetail): string {
    if (!detail.isBillable || detail.priceCents == null) return 'Not billable';
    const amount = (detail.priceCents / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: detail.currency || 'USD',
    });
    return detail.paymentRequired ? `${amount} (payment required)` : amount;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 || 12;
    return m === 0 ? `${hour12} ${period}` : `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }

  async openViewBookings(row: BookingTypeRow) {
    this.viewBookingsType.set(row);
    this.showViewBookingsDialog.set(true);
    this.viewBookingsLoading.set(true);
    this.viewBookingsError.set(null);
    this.viewBookings.set([]);
    try {
      const data = await this.api.get<TypeBookingRow[]>(
        `/booking/admin/bookings?bookingTypeId=${encodeURIComponent(row.id)}`,
      );
      this.viewBookings.set(data);
    } catch (err) {
      this.viewBookingsError.set(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      this.viewBookingsLoading.set(false);
    }
  }

  closeViewBookings() {
    this.showViewBookingsDialog.set(false);
    this.viewBookingsType.set(null);
    this.viewBookings.set([]);
    this.viewBookingsError.set(null);
  }

  formatWhen(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  statusSeverity(status: string): 'success' | 'secondary' {
    return status === 'CONFIRMED' ? 'success' : 'secondary';
  }

  confirmDeleteType(row: BookingTypeRow) {
    this.confirmDelete.confirm({
      message: `Delete "${row.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/booking/admin/types/${row.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to delete booking type');
        }
      },
    });
  }
}
