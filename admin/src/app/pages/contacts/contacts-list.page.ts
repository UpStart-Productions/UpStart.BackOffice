import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { CreatePersonModalComponent } from '../../ui/create-person-modal/create-person-modal.component';
import { PeopleImportModalComponent } from '../../ui/people-import-modal/people-import-modal.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { CrmTagsApi } from '../../core/crm-tags.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { SessionService } from '../../core/session.service';
import { LIST_VIEW_KEYS, listViewFilterBool, listViewFilterString, readListViewPrefs } from '../../core/list-view-prefs.storage';
import { loadListSearch, loadTableSort, onTableSortSave, saveListFilter, saveListSearch } from '../../core/list-view-prefs.util';
import { TagChipListComponent } from '../../ui/tag-input/tag-chip-list.component';

type PeopleTableRow = ContactSummary & {
  primaryEmail: string;
  organizationsSort: string;
};

@Component({
  selector: 'app-contacts-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    CreatePersonModalComponent,
    PeopleImportModalComponent,
    ButtonModule,
    ToolbarSearchFieldComponent,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    PageComponent,
    CopyEmailComponent,
    RowActionsMenuComponent,
    TagChipListComponent,
  ],
  template: `
    <app-page title="People">
      @if (canCreate()) {
        <ng-container ngProjectAs="[pageActions]">
          <span class="split-action">
            <p-button label="New Person" icon="pi pi-plus" (onClick)="openNew()" />
            @if (headerMenu().length) {
              <app-row-actions-menu
                class="split-action-more"
                [attached]="true"
                [items]="headerMenu()"
                ariaLabel="More people actions"
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
          <div class="toolbar-start">
            <p-select
              [options]="tagOptions()"
              [ngModel]="tag"
              (ngModelChange)="onTag($event)"
              [showClear]="true"
              placeholder="Any tag"
              ariaLabel="Filter by tag"
              styleClass="people-tag-filter"
            />
            @if (review()) {
              <p-tag value="Needs review" severity="info" />
            }
          </div>
          <div class="toolbar-search">
            <app-toolbar-search-field
              placeholder="Search name, email, or account…"
              ariaLabel="Search people"
              [ngModel]="query"
              (ngModelChange)="onSearch($event)"
            />
          </div>
        </div>

        <p-table
          [value]="peopleTableRows()"
          [loading]="loading()"
          [sortField]="tableSortField()"
          [sortOrder]="tableSortOrder()"
          (onSort)="onTableSort($event)"
          styleClass="table-bordered"
          [paginator]="peopleTableRows().length > pageSize"
          [rows]="pageSize"
        >
          <ng-template pTemplate="header">
            <tr>
              <th class="network-list-leading-col"></th>
              <th pSortableColumn="lastName">
                Name
                <p-sortIcon field="lastName" />
              </th>
              <th pSortableColumn="primaryEmail">
                Email
                <p-sortIcon field="primaryEmail" />
              </th>
              <th pSortableColumn="organizationsSort">
                Accounts
                <p-sortIcon field="organizationsSort" />
              </th>
              <th>Tags</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td>
                <div class="network-list-leading">
                  <app-row-actions-menu [items]="rowActions(c)" ariaLabel="Person actions" />
                  @if (contactAvatar(c); as avatarSrc) {
                    <img class="network-list-avatar" [src]="avatarSrc" [alt]="name(c)" />
                  } @else {
                    <span class="network-list-avatar network-list-avatar--initials" aria-hidden="true">
                      {{ contactInitials(c) }}
                    </span>
                  }
                </div>
              </td>
              <td>
                <a [routerLink]="['/people', c.id]" class="text-primary">{{ name(c) }}</a>
                @if (c.title) {
                  <div class="text-color-secondary text-sm">{{ c.title }}</div>
                }
                @if (c.autoCreated) {
                  <p-tag value="New" severity="info" class="ml-2" />
                }
                @if (!c.isActive) {
                  <p-tag value="Inactive" severity="secondary" class="ml-2" />
                }
              </td>
              <td><app-copy-email [email]="c.emails[0]?.email" /></td>
              <td>
                @for (link of c.accountLinks; track link.clientId; let last = $last) {
                  <a [routerLink]="['/accounts', link.clientId]" class="text-primary">{{ link.client.name }}</a>{{ last ? '' : ', ' }}
                }
              </td>
              <td>
                <app-tag-chip-list
                  [tags]="c.tags"
                  [removable]="canEdit()"
                  (removeTag)="removeTag(c, $event)"
                />
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">
                <div class="empty-state">
                  <i class="pi pi-address-book" aria-hidden="true"></i>
                  <p>{{ review() ? 'Nothing needs review.' : query || tag ? 'No people match these filters.' : 'No people yet.' }}</p>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <app-create-person-modal />
      <app-people-import-modal />
    </app-page>
  `,
  styles: `
    :host ::ng-deep .people-tag-filter { min-width: 11rem; }
  `,
})
export class ContactsListPage implements OnInit {
  private readonly comms = inject(CommunicationsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly crmTags = inject(CrmTagsApi);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);
  readonly tagOptions = () => this.crmTags.tags().map((t) => t.name);
  readonly canDelete = () => this.session.can('contacts', 'delete');
  readonly canCreate = () => this.session.can('contacts', 'edit');
  readonly canEdit = () => this.session.can('contacts', 'edit');

  contacts = signal<ContactSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  query = '';
  review = signal(false);
  tag: string | null = null;
  tableSortField = signal('lastName');
  tableSortOrder = signal<1 | -1>(1);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly peopleTableRows = computed((): PeopleTableRow[] =>
    this.contacts().map((c) => ({
      ...c,
      primaryEmail: c.emails[0]?.email ?? '',
      organizationsSort: c.accountLinks
        .map((link) => link.client.name)
        .sort((a, b) => a.localeCompare(b))
        .join(', '),
    })),
  );

  private readonly createPersonModal = viewChild.required(CreatePersonModalComponent);
  private readonly importModal = viewChild.required(PeopleImportModalComponent);

  name = contactName;
  readonly pageSize = 25;

  readonly headerMenu = computed((): RowActionItem[] => {
    const items: RowActionItem[] = [
      {
        id: 'import',
        label: 'Import people',
        icon: 'pi pi-upload',
        command: () => void this.openImport(),
      },
    ];
    if (!this.review()) {
      items.push({
        id: 'review',
        label: 'Needs review',
        icon: 'pi pi-inbox',
        badge: this.comms.reviewCount(),
        command: () => this.setReview(true),
      });
    } else {
      items.push({
        id: 'review-all',
        label: 'Show all people',
        icon: 'pi pi-list',
        command: () => this.setReview(false),
      });
    }
    return items;
  });

  contactAvatar(c: ContactSummary): string | null {
    return resolveAssetUrl(c.avatarUrl ?? null);
  }

  contactInitials(c: ContactSummary): string {
    const first = c.firstName.trim().charAt(0);
    const last = (c.lastName ?? '').trim().charAt(0);
    return (first + last).toUpperCase() || '?';
  }

  async ngOnInit() {
    void this.crmTags.load();
    const listPrefs = readListViewPrefs(this.session.me()?.id, LIST_VIEW_KEYS.people);
    const search = loadListSearch(this.session, LIST_VIEW_KEYS.people);
    if (search) this.query = search;
    const sort = loadTableSort(this.session, LIST_VIEW_KEYS.people, { field: 'lastName', order: 1 });
    this.tableSortField.set(sort.field);
    this.tableSortOrder.set(sort.order);
    const snap = this.route.snapshot.queryParamMap;
    this.tag = snap.has('tag') ? snap.get('tag') : listViewFilterString(listPrefs, 'tag');
    const reviewParam = snap.get('review');
    if (reviewParam === 'true') {
      this.review.set(true);
    } else if (!snap.has('review')) {
      const savedReview = listViewFilterBool(listPrefs, 'review');
      if (savedReview === true) this.review.set(true);
    }
    void this.comms.refreshReviewCount();
    await this.load();
  }

  onTableSort(event: { field?: string | string[] | null; order?: number | null }) {
    const saved = onTableSortSave(this.session, LIST_VIEW_KEYS.people, event);
    if (saved) {
      this.tableSortField.set(saved.field);
      this.tableSortOrder.set(saved.order);
    }
  }

  onSearch(value: string) {
    this.query = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      saveListSearch(this.session, LIST_VIEW_KEYS.people, value);
      void this.load();
    }, 250);
  }

  onTag(value: string | null) {
    this.tag = value;
    saveListFilter(this.session, LIST_VIEW_KEYS.people, 'tag', value);
    void this.router.navigate([], { queryParams: { tag: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
    void this.load();
  }

  setReview(value: boolean) {
    this.review.set(value);
    saveListFilter(this.session, LIST_VIEW_KEYS.people, 'review', value);
    void this.router.navigate([], {
      queryParams: { review: value ? 'true' : null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.comms.contacts({ q: this.query, review: this.review(), tag: this.tag });
      this.contacts.set(list);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      this.loading.set(false);
    }
  }

  rowActions(c: ContactSummary): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'open', label: 'Open', icon: 'pi pi-pencil', command: () => this.router.navigate(['/people', c.id]) },
    ];
    if (c.autoCreated) {
      items.push({ id: 'reviewed', label: 'Mark reviewed', icon: 'pi pi-check', command: () => void this.markReviewed(c) });
    }
    if (this.canDelete()) {
      items.push({
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDeletePerson(c),
      });
    }
    return items;
  }

  async removeTag(c: ContactSummary, tag: string) {
    const next = c.tags.filter((t) => t !== tag);
    try {
      await this.comms.updateContact(c.id, { tags: next });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not update tags');
    }
  }

  confirmDeletePerson(c: ContactSummary) {
    this.confirmDelete.confirm({
      message: `Delete "${this.name(c)}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.comms.deleteContact(c.id);
          await this.load();
          void this.comms.refreshReviewCount();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }

  async markReviewed(c: ContactSummary) {
    try {
      await this.comms.updateContact(c.id, { autoCreated: false });
      await this.load();
      void this.comms.refreshReviewCount();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async openNew() {
    const created = await this.createPersonModal().open();
    if (created) await this.router.navigate(['/people', created.id]);
  }

  async openImport() {
    const imported = await this.importModal().open();
    if (imported) {
      await this.load();
      void this.comms.refreshReviewCount();
    }
  }
}
