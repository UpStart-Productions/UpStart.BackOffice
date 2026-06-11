import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
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
})
export class BookingTypesListPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  types = signal<BookingTypeRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  viewBookingsType = signal<BookingTypeRow | null>(null);
  showViewBookingsDialog = signal(false);
  viewBookings = signal<TypeBookingRow[]>([]);
  viewBookingsLoading = signal(false);
  viewBookingsError = signal<string | null>(null);

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
