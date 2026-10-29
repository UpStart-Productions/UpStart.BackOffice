import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import type { CareFormAccessLevel, CareFormKind, CareRecordListItemDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { CARE_KIND_LIST_TITLE } from '../../ui/care-forms/care.types';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';

/** Care → Intake and Care → Care profiles: every organization's copy of the form (route data: kind). */
@Component({
  selector: 'app-care-records-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    MessageModule,
    TableModule,
    TabsModule,
    TagModule,
    AppDialogModule,
    PageComponent,
    OrganizationSelectComponent,
    ToolbarSearchFieldComponent,
  ],
  template: `
    <app-page [title]="title" [helpKey]="kind === 'INTAKE' ? 'care.intake.page' : 'care.profiles.page'">
      @if (myAccess() === 'edit') {
        <p-button pageActions [label]="kind === 'INTAKE' ? 'New intake' : 'New care profile'" icon="pi pi-plus" (onClick)="openNew()" />
      }
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        @if (canSeePending()) {
          <p-tabs [value]="tab()" (valueChange)="setTab($event)">
            <p-tablist>
              <p-tab value="all">All</p-tab>
              <p-tab value="pending">
                Waiting for review
                @if (pendingCount()) {
                  <span class="count-badge ml-2">{{ pendingCount() }}</span>
                }
              </p-tab>
            </p-tablist>
          </p-tabs>
        }
        <div class="toolbar">
          <div class="toolbar-search">
            <app-toolbar-search-field placeholder="Search by organization or name…" ariaLabel="Search" [(ngModel)]="query" />
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" styleClass="table-bordered" [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th>{{ tab() === 'pending' ? 'Submitted by' : 'Organization' }}</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Updated by</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td>
                <a [routerLink]="['/care/records', r.id]" class="text-primary">{{ r.clientName ?? r.submitterName ?? 'Untitled' }}</a>
              </td>
              <td>
                @if (r.status === 'PENDING') {
                  <p-tag value="Waiting for review" severity="warn" />
                } @else {
                  <p-tag value="Active" severity="success" />
                }
              </td>
              <td>{{ r.updatedAt | date: 'MMM d, y' }}</td>
              <td>{{ r.updatedByName ?? '' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="4">{{ emptyText() }}</td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog [header]="kind === 'INTAKE' ? 'New intake' : 'New care profile'" [(visible)]="newVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <div class="form-field">
          <label for="crOrg">Organization</label>
          <app-organization-select inputId="crOrg" [(value)]="newClientId" [exclude]="takenClientIds()" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="creating()" (onClick)="newVisible = false" />
          <p-button label="Start" icon="pi pi-check" [loading]="creating()" [disabled]="!newClientId" (onClick)="create()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
})
export class CareRecordsPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly kind = (this.route.snapshot.data['kind'] as CareFormKind) ?? 'INTAKE';
  readonly title = CARE_KIND_LIST_TITLE[this.kind];

  items = signal<CareRecordListItemDto[]>([]);
  myAccess = signal<CareFormAccessLevel | null>(null);
  formId = signal<string | null>(null);
  pendingCount = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);
  tab = signal<'all' | 'pending'>('all');
  query = '';

  newVisible = false;
  newClientId: string | null = null;
  creating = signal(false);

  /** Pending public intakes are for people who can edit intakes and reach every organization (the API decides). */
  canSeePending = computed(() => this.kind === 'INTAKE' && (this.pendingCount() > 0 || this.tab() === 'pending'));
  takenClientIds = computed(() => this.items().map((r) => r.clientId).filter((id): id is string => !!id));

  filtered() {
    const q = this.query.trim().toLowerCase();
    const rows = this.items().filter((r) => (this.tab() === 'pending' ? r.status === 'PENDING' : true));
    if (!q) return rows;
    return rows.filter((r) => [r.clientName, r.submitterName, r.submitterEmail].some((v) => v?.toLowerCase().includes(q)));
  }

  emptyText() {
    if (this.myAccess() === null && !this.loading()) return 'Your role has no access to this form.';
    if (this.tab() === 'pending') return 'Nothing waiting for review.';
    return this.kind === 'INTAKE' ? 'No intake forms yet.' : 'No care profiles yet.';
  }

  async ngOnInit() {
    if (this.kind === 'INTAKE' && this.route.snapshot.queryParamMap.get('tab') === 'pending') this.tab.set('pending');
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.care.records(this.kind);
      this.items.set(res.items);
      this.myAccess.set(res.myAccess);
      this.formId.set(res.formId);
      this.pendingCount.set(res.pendingCount);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(value: string | number | undefined) {
    const tab = value === 'pending' ? 'pending' : 'all';
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'pending' ? 'pending' : null }, replaceUrl: true });
  }

  openNew() {
    this.newClientId = null;
    this.newVisible = true;
  }

  async create() {
    const formId = this.formId();
    if (!formId || !this.newClientId) return;
    this.creating.set(true);
    try {
      const { id } = await this.care.createRecord(formId, this.newClientId);
      this.newVisible = false;
      await this.router.navigate(['/care/records', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.creating.set(false);
    }
  }
}
