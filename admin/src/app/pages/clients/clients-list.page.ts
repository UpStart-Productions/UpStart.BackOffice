import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { AccountJourney } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { lastContactLabel } from '../../core/staleness.util';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

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
 * limited to status Client; "Include past clients" adds Past client.
 */
@Component({
  selector: 'app-clients-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TableModule,
    MessageModule,
    TagModule,
    ToggleSwitchModule,
    PageComponent,
    RowActionsMenuComponent,
    CopyEmailComponent,
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
  includePast = signal(false);
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

  onIncludePast(value: boolean) {
    this.includePast.set(value);
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
      const journey = this.includePast() ? 'CLIENT,PAST_CLIENT' : 'CLIENT';
      this.clients.set(await this.api.get<OrganizationRow[]>(`/clients?journey=${journey}`));
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
