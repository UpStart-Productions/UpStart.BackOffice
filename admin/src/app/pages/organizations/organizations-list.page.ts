import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CLIENT_DIMENSION_KEYS, type AccountJourney, type ClientDto } from '@upstart/back-office/shared';
import { ACCOUNT_JOURNEY_LABELS } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { SessionService } from '../../core/session.service';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import type { OrganizationRow } from '../clients/clients-list.page';
import { OrganizationsImportModalComponent } from '../../ui/organizations-import-modal/organizations-import-modal.component';
import { TagChipListComponent } from '../../ui/tag-input/tag-chip-list.component';

type StatusFilter = 'all' | AccountJourney;

/** Every organization (prospects, clients, partners and others), filtered by status and tag. */
@Component({
  selector: 'app-organizations-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ToolbarSearchFieldComponent,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
    CopyEmailComponent,
    OrganizationsImportModalComponent,
    TagChipListComponent,
  ],
  styles: [
    `
      .org-type-filter,
      .org-tag-filter {
        width: 8.25rem;
        max-width: 8.25rem;
        flex: 0 0 8.25rem;
      }
    `,
  ],
  template: `
    <app-page title="Organizations">
      @if (canCreate()) {
        <ng-container ngProjectAs="[pageActions]">
          <span class="split-action">
            <a pButton label="New Organization" icon="pi pi-plus" routerLink="/organizations/new"></a>
            @if (canEdit()) {
              <app-row-actions-menu
                class="split-action-more"
                [attached]="true"
                [items]="headerMenu()"
                ariaLabel="More organization actions"
              />
            }
          </span>
        </ng-container>
      }
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <div class="toolbar">
          <p-select
            [options]="typeFilterOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="status() === 'all' ? null : status()"
            (ngModelChange)="onTypeFilter($event)"
            [showClear]="true"
            placeholder="Any Type"
            ariaLabel="Filter by type"
            styleClass="org-type-filter"
          />
          <p-select
            [options]="tagOptions()"
            [ngModel]="tag()"
            (ngModelChange)="setFilter({ tag: $event })"
            [showClear]="true"
            placeholder="Any Tag"
            ariaLabel="Filter by tag"
            styleClass="org-tag-filter"
          />
          <div class="toolbar-search">
            <app-toolbar-search-field
              placeholder="Search by name, email…"
              ariaLabel="Search organizations"
              [ngModel]="searchQuery"
              (ngModelChange)="onSearchInput($event)"
            />
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" sortField="name" [sortOrder]="1" styleClass="table-bordered"
          [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th pSortableColumn="name">Name <p-sortIcon field="name" /></th>
              <th pSortableColumn="journey">Status <p-sortIcon field="journey" /></th>
              <th>Email</th>
              <th>Tags</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-org>
            <tr>
              <td><app-row-actions-menu [items]="rowActions(org)" ariaLabel="Organization actions" /></td>
              <td><a [routerLink]="['/organizations', org.id]" class="text-primary">{{ org.name }}</a></td>
              <td>
                <p-tag [value]="statusLabel(org)" [severity]="org.journey === 'CLIENT' ? 'success' : 'secondary'" />
              </td>
              <td><app-copy-email [email]="org.email" /></td>
              <td>
                <app-tag-chip-list
                  [tags]="org.tags"
                  [removable]="canEdit()"
                  (removeTag)="removeTag(org, $event)"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5" class="text-center p-4 text-color-secondary">
                {{ searchDebounced().trim() || status() !== 'all' || tag() ? 'No organizations match these filters.' : 'No organizations yet.' }}
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <app-organizations-import-modal />
    </app-page>
  `,
})
export class OrganizationsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly session = inject(SessionService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly crmTags = inject(CrmTagsApi);
  readonly canCreate = computed(() => this.session.can('clients', 'create'));
  readonly canEdit = computed(() => this.session.can('clients', 'edit'));
  readonly canDelete = computed(() => this.session.can('clients', 'delete'));

  private readonly importModal = viewChild.required(OrganizationsImportModalComponent);

  readonly headerMenu = computed((): RowActionItem[] => [
    {
      id: 'import',
      label: 'Import organizations',
      icon: 'pi pi-upload',
      command: () => void this.openImport(),
    },
  ]);

  readonly typeFilterOptions: { value: AccountJourney; label: string }[] = [
    { value: 'CLIENT', label: 'Clients' },
    { value: 'NONE', label: 'Partner / other' },
  ];

  private readonly validStatusFilters = new Set<StatusFilter>(['all', ...this.typeFilterOptions.map((o) => o.value)]);
  readonly tagOptions = computed(() => this.crmTags.tags().map((t) => t.name));

  orgs = signal<OrganizationRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  status = signal<StatusFilter>('all');
  tag = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filtered = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.orgs();
    if (!q) return list;
    return list.filter((o) => [o.name, o.code, o.tags.join(' '), o.email, o.phone].filter(Boolean).join(' ').toLowerCase().includes(q));
  });

  ngOnInit() {
    void this.crmTags.load();
    // Filters live in the URL (?status=PROSPECT&tag=Partner) so views can be bookmarked and linked.
    this.route.queryParamMap.subscribe((params) => {
      const s = params.get('status') as StatusFilter | null;
      this.status.set(s && this.validStatusFilters.has(s) ? s : 'all');
      this.tag.set(params.get('tag'));
      void this.load();
    });
  }

  onTypeFilter(value: AccountJourney | null) {
    this.setFilter({ status: value ?? 'all' });
  }

  setFilter(change: { status?: StatusFilter; tag?: string | null }) {
    const status = change.status ?? this.status();
    const tag = 'tag' in change ? change.tag : this.tag();
    void this.router.navigate([], {
      queryParams: { status: status === 'all' ? null : status, tag: tag || null },
      queryParamsHandling: 'merge',
    });
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.searchDebounced.set(value), 150);
  }

  statusLabel(org: OrganizationRow): string {
    if (org.journey === 'PROSPECT') return 'Legacy';
    if (org.journey === 'NONE' && org.tags.some((t) => t.toLowerCase() === 'partner')) return 'Partner';
    return ACCOUNT_JOURNEY_LABELS[org.journey];
  }

  async load() {
    this.loading.set(true);
    try {
      const params = new URLSearchParams();
      if (this.status() !== 'all') params.set('journey', this.status());
      if (this.tag()) params.set('tag', this.tag()!);
      const qs = params.toString();
      const rows = await this.api.get<ClientDto[]>(`/clients${qs ? `?${qs}` : ''}`);
      this.orgs.set(
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
      this.error.set(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      this.loading.set(false);
    }
  }

  rowActions(org: OrganizationRow): RowActionItem[] {
    const actions: RowActionItem[] = [];
    if (org.journey !== 'CLIENT' && this.canEdit()) {
      actions.push({ id: 'make-client', label: 'Make client', icon: 'pi pi-check', command: () => void this.makeClient(org) });
    }
    actions.push({
      id: 'edit',
      label: this.canEdit() ? 'Edit' : 'Open',
      icon: this.canEdit() ? 'pi pi-pencil' : 'pi pi-arrow-right',
      command: () => this.router.navigate(['/organizations', org.id]),
    });
    if (this.canDelete()) {
      actions.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(org) });
    }
    return actions;
  }

  async removeTag(org: OrganizationRow, tag: string) {
    const next = org.tags.filter((t) => t !== tag);
    try {
      await this.api.put(`/clients/${org.id}`, { dimensions: { tags: next } });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update tags');
    }
  }

  async makeClient(org: OrganizationRow) {
    try {
      await this.api.put(`/clients/${org.id}`, { journey: 'CLIENT' });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update');
    }
  }

  async openImport() {
    const imported = await this.importModal().open();
    if (imported) await this.load();
  }

  confirmDelete(org: OrganizationRow) {
    this.deleteConfirm.confirm({
      message: `Delete "${org.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/clients/${org.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
