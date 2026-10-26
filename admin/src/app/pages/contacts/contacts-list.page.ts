import { Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { CreatePersonModalComponent } from '../../ui/create-person-modal/create-person-modal.component';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { CommunicationsApi, contactName, ContactSummary } from '../../core/communications.api';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { CrmTagsApi } from '../../core/crm-tags.api';

@Component({
  selector: 'app-contacts-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    CreatePersonModalComponent,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    PageComponent,
    CopyEmailComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page title="People" [skipTitle]="true">
      <div class="card">
        <h2 class="page-title page-title-in-card">People</h2>
        @if (error()) {
          <p-message severity="error" [text]="error()!" class="mb-3" />
        }
        <div class="toolbar">
          <div class="toolbar-start">
            <p-button label="New Person" icon="pi pi-plus" (onClick)="openNew()" />
            <p-select
              [options]="tagOptions()"
              [ngModel]="tag"
              (ngModelChange)="onTag($event)"
              [showClear]="true"
              placeholder="Any tag"
              ariaLabel="Filter by tag"
              styleClass="people-tag-filter"
            />
            <div class="flex align-items-center gap-2">
              <p-checkbox inputId="review" [ngModel]="review" (ngModelChange)="onReview($event)" [binary]="true" />
              <label for="review">Needs review</label>
              @if (reviewCount() > 0) {
                <p-tag [value]="'' + reviewCount()" severity="info" />
              }
            </div>
          </div>
          <div class="toolbar-search">
            <p-iconfield iconPosition="left" class="toolbar-search-field">
              <p-inputicon><i class="pi pi-search"></i></p-inputicon>
              <input
                pInputText
                type="text"
                class="w-full"
                placeholder="Search by name or email…"
                [ngModel]="query"
                (ngModelChange)="onSearch($event)"
                aria-label="Search people"
              />
            </p-iconfield>
            @if (query) {
              <p-button icon="pi pi-times" [text]="true" severity="secondary" aria-label="Clear search" (onClick)="onSearch('')" />
            }
          </div>
        </div>

        <p-table
          [value]="contacts()"
          [loading]="loading()"
          styleClass="table-bordered"
          [paginator]="contacts().length > pageSize"
          [rows]="pageSize"
        >
          <ng-template pTemplate="header">
            <tr>
              <th class="network-list-leading-col"></th>
              <th pSortableColumn="firstName">
                Name
                <p-sortIcon field="firstName" />
              </th>
              <th>Email</th>
              <th>Organizations</th>
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
                  <a [routerLink]="['/organizations', link.clientId]" class="text-primary">{{ link.client.name }}</a>{{ last ? '' : ', ' }}
                } @empty {
                  <span class="text-color-secondary">—</span>
                }
              </td>
              <td>
                <div class="people-tags">
                  @for (t of c.tags; track t) { <span class="people-tag">{{ t }}</span> }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr>
              <td colspan="5">
                <div class="empty-state">
                  <i class="pi pi-address-book" aria-hidden="true"></i>
                  <p>{{ review ? 'Nothing needs review.' : query || tag ? 'No people match these filters.' : 'No people yet.' }}</p>
                </div>
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <app-create-person-modal />
    </app-page>
  `,
  styles: `
    .people-tags { display: flex; flex-wrap: wrap; gap: 0.35rem; }
    .people-tag {
      padding: 0.1rem 0.55rem;
      border: 1px solid var(--surface-border);
      border-radius: 999px;
      background: var(--surface-ground);
      white-space: nowrap;
    }
    :host ::ng-deep .people-tag-filter { min-width: 11rem; }
  `,
})
export class ContactsListPage implements OnInit {
  private readonly comms = inject(CommunicationsApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly crmTags = inject(CrmTagsApi);
  readonly tagOptions = () => this.crmTags.tags().map((t) => t.name);

  contacts = signal<ContactSummary[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  query = '';
  review = false;
  tag: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  private readonly createPersonModal = viewChild.required(CreatePersonModalComponent);

  name = contactName;
  readonly pageSize = 25;

  contactAvatar(c: ContactSummary): string | null {
    return resolveAssetUrl(c.avatarUrl ?? null);
  }

  contactInitials(c: ContactSummary): string {
    const first = c.firstName.trim().charAt(0);
    const last = (c.lastName ?? '').trim().charAt(0);
    return (first + last).toUpperCase() || '?';
  }
  /** Contacts awaiting review, from the last unsearched load. */
  reviewCount = signal(0);

  async ngOnInit() {
    void this.crmTags.load();
    this.tag = this.route.snapshot.queryParamMap.get('tag');
    await this.load();
  }

  onSearch(value: string) {
    this.query = value;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.load(), 250);
  }

  onTag(value: string | null) {
    this.tag = value;
    void this.router.navigate([], { queryParams: { tag: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
    void this.load();
  }

  onReview(value: boolean) {
    this.review = value;
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const list = await this.comms.contacts({ q: this.query, review: this.review, tag: this.tag });
      this.contacts.set(list);
      if (!this.query.trim() && !this.tag) this.reviewCount.set(this.review ? list.length : list.filter((c) => c.autoCreated).length);
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
    return items;
  }

  async markReviewed(c: ContactSummary) {
    try {
      await this.comms.updateContact(c.id, { autoCreated: false });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async openNew() {
    const created = await this.createPersonModal().open();
    if (created) await this.router.navigate(['/people', created.id]);
  }
}
