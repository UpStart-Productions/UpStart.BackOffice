import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CLIENT_DIMENSION_KEYS, type AccountJourney, type ClientDto } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { lastContactLabel } from '../../core/staleness.util';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { TagChipListComponent } from '../../ui/tag-input/tag-chip-list.component';

export type OrganizationRow = {
  id: string;
  name: string;
  code?: string | null;
  journey: AccountJourney;
  tags: string[];
  lastContactAt?: string | null;
  email?: string;
  phone?: string;
  isActive: boolean;
};

/**
 * Clients (under Office): the organizations you're working for. Same records as Organizations,
 * limited to status Client. Active and Inactive come from each client record.
 */
@Component({
  selector: 'app-clients-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ToolbarSearchFieldComponent,
    TableModule,
    MessageModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
    CopyEmailComponent,
    TagChipListComponent,
  ],
  templateUrl: './clients-list.page.html',
})
export class ClientsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  readonly canCreate = computed(() => this.session.can('clients', 'create'));
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));
  readonly canDelete = computed(() => this.session.can('clients', 'delete'));
  readonly lastContactLabel = lastContactLabel;

  clients = signal<OrganizationRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredClients = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.clients();
    if (!q) return list;
    return list.filter((c) =>
      [c.name, c.code, c.tags.join(' '), c.email, c.phone].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  });

  readonly emptyMessage = computed(() =>
    this.searchDebounced().trim() && this.clients().length ? 'No clients match your search.' : 'No clients yet.',
  );

  ngOnInit() {
    void this.load();
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced.set('');
  }

  async load() {
    this.loading.set(true);
    try {
      const rows = await this.api.get<ClientDto[]>(`/clients?journey=CLIENT`);
      this.clients.set(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          journey: c.journey,
          tags: c.dimensions?.[CLIENT_DIMENSION_KEYS.tags] ?? [],
          lastContactAt: c.lastContactAt ?? null,
          email: c.email ?? undefined,
          phone: c.phone ?? undefined,
          isActive: c.isActive,
        })),
      );
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      this.loading.set(false);
    }
  }

  getRowActions(client: OrganizationRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        id: 'edit',
        label: this.canEdit() ? 'Edit' : 'Open',
        icon: this.canEdit() ? 'pi pi-pencil' : 'pi pi-arrow-right',
        command: () => this.router.navigate(['/clients', client.id]),
      },
    ];
    if (this.canDelete()) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(client) });
    }
    return actions;
  }

  async removeTag(client: OrganizationRow, tag: string) {
    const next = client.tags.filter((t) => t !== tag);
    try {
      await this.api.put(`/clients/${client.id}`, { dimensions: { tags: next } });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update tags');
    }
  }

  confirmDelete(client: OrganizationRow) {
    this.deleteConfirm.confirm({
      message: `Delete "${client.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/clients/${client.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
