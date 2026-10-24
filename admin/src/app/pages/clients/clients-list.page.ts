import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { lastContactLabel } from '../../core/staleness.util';
import type { AccountJourney } from '@upstart/back-office/shared';
import { ACCOUNT_JOURNEY_LABELS } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';

import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';

type Client = {
  id: string;
  name: string;
  code?: string | null;
  journey: AccountJourney;
  roles: string[];
  isReferralReady?: boolean;
  lastContactAt?: string | null;
  email?: string;
  phone?: string;
  isActive: boolean;
};

type View = 'clients' | 'prospects' | 'past' | 'partners' | 'all';

/** Saved views over the one Accounts table. Clients is the default. */
const VIEWS: Record<View, { label: string; query: string; kind: string; newQuery?: Record<string, string> }> = {
  clients: { label: 'Clients', query: '?journey=CLIENT', kind: 'client' },
  prospects: { label: 'Prospects', query: '?journey=PROSPECT', kind: 'prospect', newQuery: { journey: 'PROSPECT' } },
  past: { label: 'Past clients', query: '?journey=PAST_CLIENT', kind: 'past client' },
  partners: { label: 'Partners', query: '?role=Partner', kind: 'partner', newQuery: { journey: 'NONE', role: 'Partner' } },
  all: { label: 'All', query: '', kind: 'account' },
};

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
    SelectButtonModule,
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
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  readonly canCreate = computed(() => this.session.can('clients', 'create'));
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));
  readonly canDelete = computed(() => this.session.can('clients', 'delete'));
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  readonly viewOptions = (Object.keys(VIEWS) as View[]).map((value) => ({ value, label: VIEWS[value].label }));
  readonly journeyLabels = ACCOUNT_JOURNEY_LABELS;
  readonly lastContactLabel = lastContactLabel;

  view = signal<View>('clients');
  readonly kind = computed(() => VIEWS[this.view()].kind);
  readonly newQuery = computed(() => VIEWS[this.view()].newQuery ?? {});
  clients = signal<Client[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  referralReadyOnly = signal(false);
  searchQuery = '';
  searchDebounced = signal('');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredClients = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.referralReadyOnly() ? this.clients().filter((c) => c.isReferralReady) : this.clients();
    if (!q) return list;
    return list.filter((client) => this.clientMatchesSearch(client, q));
  });

  readonly emptyMessage = computed(() => {
    if (this.searchDebounced().trim() && this.filteredClients().length === 0 && this.clients().length > 0) {
      return `No ${this.kind()}s match your search.`;
    }
    return this.view() === 'clients' ? 'No clients yet.' : `No ${this.kind()}s yet.`;
  });

  ngOnInit() {
    this.route.queryParamMap.subscribe((params) => {
      const v = params.get('view') as View | null;
      this.view.set(v && v in VIEWS ? v : 'clients');
      void this.load();
    });
  }

  onViewChange(view: View) {
    void this.router.navigate([], { queryParams: { view: view === 'clients' ? null : view }, queryParamsHandling: 'merge' });
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
      client.roles?.join(' '),
      ACCOUNT_JOURNEY_LABELS[client.journey],
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
      const data = await this.api.get<Client[]>(`/clients${VIEWS[this.view()].query}`);
      this.clients.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load clients');
    } finally { this.loading.set(false); }
  }

  getRowActions(client: Client): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (client.journey !== 'CLIENT' && this.canEdit()) {
      actions.push({ id: 'make-client', label: 'Make client', icon: 'pi pi-check', command: () => this.makeClient(client) });
    }
    actions.push({
      id: 'edit',
      label: this.canEdit() ? 'Edit' : 'Open',
      icon: this.canEdit() ? 'pi pi-pencil' : 'pi pi-arrow-right',
      command: () => this.router.navigate(['/clients', client.id]),
    });
    if (this.canDelete()) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(client) });
    }
    return actions;
  }

  async makeClient(client: Client) {
    try {
      await this.api.put(`/clients/${client.id}`, { journey: 'CLIENT' });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update');
    }
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
