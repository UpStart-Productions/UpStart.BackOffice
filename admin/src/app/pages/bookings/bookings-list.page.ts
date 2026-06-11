import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';
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
  lead: { id: string; organization: string; stage: string } | null;
};

@Component({
  selector: 'app-bookings-list-page',
  standalone: true,
  imports: [
    RouterLink,
    ButtonModule,
    TableModule,
    MessageModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './bookings-list.page.html',
})
export class BookingsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  bookings = signal<BookingRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const data = await this.api.get<BookingRow[]>('/booking/admin/bookings');
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
    if (row.status !== 'CONFIRMED') return [];
    return [
      {
        id: 'cancel',
        label: 'Cancel',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmCancel(row),
      },
    ];
  }

  confirmCancel(row: BookingRow) {
    this.confirmDelete.confirm({
      header: 'Cancel booking',
      message: `Cancel the discovery chat with ${row.guestName} on ${this.formatWhen(row.startAt)}?`,
      accept: async () => {
        try {
          await this.api.post(`/booking/admin/cancel/${row.id}`, {});
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Cancel failed');
        }
      },
    });
  }
}
