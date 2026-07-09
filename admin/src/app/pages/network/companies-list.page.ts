import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';

import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';

type NetworkContact = {
  id: string;
  firstName: string;
  lastName?: string | null;
  isPrimary: boolean;
};

type NetworkCompany = {
  id: string;
  name: string;
  services: string[];
  isActive: boolean;
  isReferralReady: boolean;
  isPublicFeatured: boolean;
  contacts: NetworkContact[];
};

@Component({
  selector: 'app-network-companies-list-page',
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
  templateUrl: './companies-list.page.html',
})
export class NetworkCompaniesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  companies = signal<NetworkCompany[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');
  referralOnly = signal(false);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredCompanies = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    let list = this.companies();
    if (this.referralOnly()) {
      list = list.filter((c) => c.isReferralReady);
    }
    if (!q) return list;
    return list.filter((company) => this.companyMatchesSearch(company, q));
  });

  readonly emptyMessage = computed(() => {
    if (this.searchDebounced().trim() && this.filteredCompanies().length === 0 && this.companies().length > 0) {
      return 'No companies match your search.';
    }
    if (this.referralOnly() && this.filteredCompanies().length === 0 && this.companies().length > 0) {
      return 'No referral-ready companies yet.';
    }
    return 'No network companies yet.';
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

  toggleReferralOnly() {
    this.referralOnly.update((v) => !v);
  }

  primaryContactName(company: NetworkCompany): string {
    const contact = company.contacts[0];
    if (!contact) return '—';
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  }

  servicesSummary(company: NetworkCompany): string {
    if (!company.services.length) return '—';
    return company.services.slice(0, 3).join(', ') + (company.services.length > 3 ? '…' : '');
  }

  private companyMatchesSearch(company: NetworkCompany, q: string): boolean {
    const haystack = [
      company.name,
      this.primaryContactName(company),
      ...company.services,
      company.isActive ? 'active' : 'inactive',
      company.isReferralReady ? 'referral' : '',
      company.isPublicFeatured ? 'featured public' : '',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<NetworkCompany[]>('/network/companies');
      this.companies.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load network companies');
    } finally {
      this.loading.set(false);
    }
  }

  getRowActions(company: NetworkCompany): RowActionItem[] {
    return [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.router.navigate(['/network', company.id]),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(company),
      },
    ];
  }

  confirmDelete(company: NetworkCompany) {
    this.deleteConfirm.confirm({
      message: `Delete "${company.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/network/companies/${company.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
