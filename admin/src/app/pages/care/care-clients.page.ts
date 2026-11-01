import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { CARE_STATUS_LABELS, type CareClientListItemDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { SessionService } from '../../core/session.service';
import { CARE_STATUS_SEVERITY } from '../../ui/care-forms/care-client-tab.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';

/** Care → Clients: the clients in care. Each row opens the client's Care tab. */
@Component({
  selector: 'app-care-clients-page',
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
    <app-page title="Clients in care" helpKey="care.clients.page">
      <ng-container ngProjectAs="[pageActions]">
        @if (canSetup() && profileFormId()) {
          <a pButton label="Customize care profile" icon="pi pi-sliders-h" severity="secondary" [outlined]="true" [routerLink]="['/care/forms', profileFormId()]"></a>
        }
        @if (canManage()) {
          <p-button label="Add to care" icon="pi pi-plus" (onClick)="openAdd()" />
        }
      </ng-container>
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <p-tabs [value]="tab()" (valueChange)="tab.set($event === 'ended' ? 'ended' : 'current')">
          <p-tablist>
            <p-tab value="current">Current</p-tab>
            <p-tab value="ended">Ended</p-tab>
          </p-tablist>
        </p-tabs>
        <div class="toolbar mt-3">
          <div class="toolbar-search">
            <app-toolbar-search-field placeholder="Search clients…" ariaLabel="Search" [(ngModel)]="query" />
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" styleClass="table-bordered" [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th>Client</th>
              <th>Status</th>
              <th>Care profile</th>
              <th>Next shift</th>
              <th>Last visit</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-c>
            <tr>
              <td><a [routerLink]="['/clients', c.clientId]" [queryParams]="{ tab: 'care' }" class="text-primary">{{ c.name }}</a></td>
              <td><p-tag [value]="statusLabel[c.careStatus]" [severity]="statusSeverity[c.careStatus]" /></td>
              <td>
                @if (c.hasCareProfile) {
                  <p-tag value="Started" severity="success" />
                } @else {
                  <p-tag value="Not started" severity="secondary" />
                }
              </td>
              <td>
                @if (c.nextShiftAt) {
                  {{ c.nextShiftAt | date: 'EEE, MMM d, h:mm a' }}
                  <div class="text-color-secondary">{{ c.nextShiftWorker ?? 'Open shift' }}</div>
                }
              </td>
              <td>{{ c.lastVisitAt ? (c.lastVisitAt | date: 'MMM d, y') : '' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5">{{ tab() === 'ended' ? 'No clients with ended care.' : 'No clients in care yet.' }}</td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog header="Add to care" [(visible)]="addVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <div class="form-field">
          <label for="careAddClient">Client</label>
          <app-organization-select inputId="careAddClient" [(value)]="addClientId" [exclude]="inCareIds()" [clientsOnly]="true" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="adding()" (onClick)="addVisible = false" />
          <p-button label="Add" icon="pi pi-check" [loading]="adding()" [disabled]="!addClientId" (onClick)="add()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
})
export class CareClientsPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly statusLabel = CARE_STATUS_LABELS;
  readonly statusSeverity = CARE_STATUS_SEVERITY;

  items = signal<CareClientListItemDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  tab = signal<'current' | 'ended'>('current');
  query = '';
  /** The Care profile form (Customize care profile). */
  profileFormId = signal<string | null>(null);
  /** Edit on the Care profile: add clients to care. */
  canManage = signal(false);
  readonly canSetup = computed(() => this.session.can('care', 'setup'));
  readonly inCareIds = computed(() => this.items().map((c) => c.clientId));

  addVisible = false;
  addClientId: string | null = null;
  adding = signal(false);

  filtered() {
    const q = this.query.trim().toLowerCase();
    return this.items().filter(
      (c) => (this.tab() === 'ended' ? c.careStatus === 'ENDED' : c.careStatus !== 'ENDED') && (!q || c.name.toLowerCase().includes(q)),
    );
  }

  async ngOnInit() {
    await this.load();
    try {
      const res = await this.care.records('CARE_PROFILE');
      this.profileFormId.set(res.formId);
      this.canManage.set(res.myAccess === 'edit');
    } catch {
      this.canManage.set(false);
    }
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.care.careClients());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.addClientId = null;
    this.addVisible = true;
  }

  async add() {
    if (!this.addClientId) return;
    this.adding.set(true);
    try {
      const id = this.addClientId;
      await this.care.setCareStatus(id, 'ACTIVE');
      this.addVisible = false;
      await this.router.navigate(['/clients', id], { queryParams: { tab: 'care' } });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add to care', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.adding.set(false);
    }
  }
}
