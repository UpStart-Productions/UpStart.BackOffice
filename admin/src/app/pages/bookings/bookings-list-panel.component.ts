import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import {
  RowActionItem,
  RowActionsMenuComponent,
} from '../../ui/row-actions-menu/row-actions-menu.component';

type BookingTypeOption = { id: string; name: string; slug: string };

type BookingRow = {
  id: string;
  startAt: string;
  endAt: string;
  status: 'CONFIRMED' | 'CANCELLED';
  guestName: string;
  guestEmail: string;
  guestOrg: string | null;
  bookingType: { id: string; slug: string; name: string; brand: string | null } | null;
  lead: { id: string; organization: string; stage: string } | null;
};

@Component({
  selector: 'app-bookings-list-panel',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TableModule,
    MessageModule,
    TagModule,
    SelectModule,
    RowActionsMenuComponent,
  ],
  templateUrl: './bookings-list-panel.component.html',
})
export class BookingsListPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  bookings = signal<BookingRow[]>([]);
  types = signal<BookingTypeOption[]>([]);
  filterTypeId = '';
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    await Promise.all([this.loadTypes(), this.load()]);
  }

  async loadTypes() {
    try {
      const data = await this.api.get<BookingTypeOption[]>('/booking/admin/types');
      this.types.set(data.map((t) => ({ id: t.id, name: t.name, slug: t.slug })));
    } catch {
      this.types.set([]);
    }
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = this.filterTypeId ? `?bookingTypeId=${encodeURIComponent(this.filterTypeId)}` : '';
      const data = await this.api.get<BookingRow[]>(`/booking/admin/bookings${params}`);
      this.bookings.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load bookings');
    } finally {
      this.loading.set(false);
    }
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

  getRowActions(row: BookingRow): RowActionItem[] {
    return [
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDeleteBooking(row),
      },
    ];
  }

  confirmDeleteBooking(row: BookingRow) {
    this.confirmDelete.confirm({
      message: `Delete the booking for ${row.guestName} on ${this.formatWhen(row.startAt)}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/booking/admin/bookings/${row.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to delete booking');
        }
      },
    });
  }
}
