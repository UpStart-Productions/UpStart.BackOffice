import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';

import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';

type Client = { id: string; name: string; code: string; email?: string; phone?: string; isActive: boolean };

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
    PageComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './clients-list.page.html',
})
export class ClientsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  clients = signal<Client[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredClients = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.clients();
    if (!q) return list;
    return list.filter((client) => this.clientMatchesSearch(client, q));
  });

  readonly emptyMessage = computed(() => {
    if (this.searchDebounced().trim() && this.filteredClients().length === 0 && this.clients().length > 0) {
      return 'No clients match your search.';
    }
    return 'No clients yet.';
  });

  async ngOnInit() {
    await this.load();
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
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private clientMatchesSearch(client: Client, q: string): boolean {
    const haystack = [
      client.name,
      client.code,
      client.email,
      client.phone,
      client.isActive ? 'active' : 'inactive',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Client[]>('/clients');
      this.clients.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load clients');
    } finally { this.loading.set(false); }
  }

  getRowActions(client: Client): RowActionItem[] {
    return [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.router.navigate(['/clients', client.id]),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(client),
      },
    ];
  }

  confirmDelete(client: Client) {
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
