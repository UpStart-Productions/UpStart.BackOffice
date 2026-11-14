import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { LIST_VIEW_KEYS } from '../../core/list-view-prefs.storage';
import { loadTableSort, onTableSortSave } from '../../core/list-view-prefs.util';
import {
  RowActionItem,
  RowActionsMenuComponent,
} from '../../ui/row-actions-menu/row-actions-menu.component';

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
  imports: [RouterLink, TableModule, MessageModule, TagModule, RowActionsMenuComponent],
  templateUrl: './bookings-list-panel.component.html',
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
})
export class BookingsListPanelComponent {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);

  /** Type filter lives in the page tab strip; list reloads when this changes. */
  readonly bookingTypeId = input('');

  bookings = signal<BookingRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  tableSortField = signal('startAt');
  tableSortOrder = signal<1 | -1>(-1);

  readonly tableRows = computed(() =>
    this.bookings().map((row) => ({
      ...row,
      typeSort: row.bookingType?.name ?? '',
      guestOrgSort: row.guestOrg ?? '',
      leadSort: row.lead?.organization ?? '',
    })),
  );

  readonly emptyMessage = computed(() =>
    this.bookingTypeId() ? 'No bookings match this type.' : 'No bookings yet.',
  );

  constructor() {
    const sort = loadTableSort(this.session, LIST_VIEW_KEYS.bookings, { field: 'startAt', order: -1 });
    this.tableSortField.set(sort.field);
    this.tableSortOrder.set(sort.order);
    effect(() => {
      const typeId = this.bookingTypeId();
      untracked(() => void this.load(typeId));
    });
  }

  onTableSort(event: { field?: string | string[] | null; order?: number | null }) {
    const saved = onTableSortSave(this.session, LIST_VIEW_KEYS.bookings, event);
    if (saved) {
      this.tableSortField.set(saved.field);
      this.tableSortOrder.set(saved.order);
    }
  }

  async load(typeId = this.bookingTypeId()) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const params = typeId ? `?bookingTypeId=${encodeURIComponent(typeId)}` : '';
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
