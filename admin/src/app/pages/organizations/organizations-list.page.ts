import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { AccountJourney } from '@upstart/back-office/shared';
import { ACCOUNT_JOURNEY_LABELS } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { SessionService } from '../../core/session.service';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import type { OrganizationRow } from '../clients/clients-list.page';

type StatusFilter = 'all' | AccountJourney;

/** Every organization (prospects, clients, past clients, partners and others), filtered by status and tag. */
@Component({
  selector: 'app-organizations-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
    CopyEmailComponent,
  ],
  styles: [
    `
      .org-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .org-tag {
        padding: 0.1rem 0.55rem;
        border: 1px solid var(--surface-border);
        border-radius: 999px;
        background: var(--surface-ground);
        white-space: nowrap;
        font-size: var(--fs-xs);
        font-weight: 600;
        line-height: 1.2;
        color: var(--color-text-secondary);
      }
      .org-tag-filter {
        min-width: 11rem;
      }
    `,
  ],
  template: `
    <app-page title="Organizations" [skipTitle]="true">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <h2 class="page-title page-title-in-card">Organizations</h2>
        <div class="toolbar">
          @if (canCreate()) {
            <a pButton label="New Organization" icon="pi pi-plus" routerLink="/organizations/new"></a>
          }
          <p-selectbutton
            [options]="statusOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="status()"
            (ngModelChange)="setFilter({ status: $event })"
            [allowEmpty]="false"
            ariaLabel="Filter by status"
          />
          <p-select
            [options]="tagOptions()"
            [ngModel]="tag()"
            (ngModelChange)="setFilter({ tag: $event })"
            [showClear]="true"
            placeholder="Any tag"
            ariaLabel="Filter by tag"
            styleClass="org-tag-filter"
          />
          <div class="toolbar-search">
            <p-iconfield iconPosition="left" class="toolbar-search-field">
              <p-inputicon><i class="pi pi-search"></i></p-inputicon>
              <input
                pInputText
                type="text"
                class="w-full"
                placeholder="Search by name, email…"
                aria-label="Search organizations"
                [ngModel]="searchQuery"
                (ngModelChange)="onSearchInput($event)"
              />
            </p-iconfield>
            @if (searchQuery) {
              <button type="button" pButton icon="pi pi-times" [text]="true" (click)="onSearchInput('')" aria-label="Clear search"></button>
            }
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" sortField="name" [sortOrder]="1" styleClass="table-bordered"
          [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th pSortableColumn="name">Name <p-sortIcon field="name" /></th>
              <th pSortableColumn="journey">Status <p-sortIcon field="journey" /></th>
              <th>Tags</th>
              <th>Email</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-org>
            <tr>
              <td><app-row-actions-menu [items]="rowActions(org)" ariaLabel="Organization actions" /></td>
              <td><a [routerLink]="['/organizations', org.id]" class="text-primary">{{ org.name }}</a></td>
              <td>
                <p-tag [value]="statusLabel(org)" [severity]="org.journey === 'CLIENT' ? 'success' : org.journey === 'PROSPECT' ? 'info' : 'secondary'" />
              </td>
              <td>
                <div class="org-tags">
                  @for (t of org.tags; track t) { <span class="org-tag">{{ t }}</span> }
                </div>
              </td>
              <td><app-copy-email [email]="org.email" /></td>
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

  readonly statusOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'PROSPECT', label: 'Prospects' },
    { value: 'CLIENT', label: 'Clients' },
    { value: 'PAST_CLIENT', label: 'Past clients' },
    { value: 'NONE', label: 'Other' },
  ];
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
      this.status.set(s && this.statusOptions.some((o) => o.value === s) ? s : 'all');
      this.tag.set(params.get('tag'));
      void this.load();
    });
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
    return ACCOUNT_JOURNEY_LABELS[org.journey];
  }

  async load() {
    this.loading.set(true);
    try {
      const params = new URLSearchParams();
      if (this.status() !== 'all') params.set('journey', this.status());
      if (this.tag()) params.set('tag', this.tag()!);
      const qs = params.toString();
      this.orgs.set(await this.api.get<OrganizationRow[]>(`/clients${qs ? `?${qs}` : ''}`));
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

  async makeClient(org: OrganizationRow) {
    try {
      await this.api.put(`/clients/${org.id}`, { journey: 'CLIENT' });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update');
    }
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
