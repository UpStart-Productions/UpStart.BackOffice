import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import type { FormSubmissionListItemDto, FormSubmissionStatus } from '@upstart/back-office/shared';
import { FormsApi } from '../../core/forms.api';
import { FormWorkspaceService } from '../../core/form-workspace.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { SUBMISSION_STATUS_TAG } from './forms.types';

type Tab = 'pending' | 'accepted' | 'dismissed' | 'all';
const TAB_STATUS: Record<Tab, FormSubmissionStatus | undefined> = { pending: 'PENDING', accepted: 'ACTIVE', dismissed: 'DISMISSED', all: undefined };

/** A form's submissions: Waiting for review, Accepted, Dismissed, All. */
@Component({
  selector: 'app-form-submissions-page',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, MessageModule, TableModule, TabsModule, TagModule, PageComponent, ToolbarSearchFieldComponent],
  template: `
    <app-page [title]="(formName() || 'Form') + ': Submissions'" [backLink]="['/forms', formId]" [backLabel]="'Back to ' + (formName() || 'form')" helpKey="forms.submissions.page">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <p-tabs [value]="tab()" (valueChange)="setTab($event)">
          <p-tablist>
            <p-tab value="pending">
              Waiting for review
              @if (pendingCount()) {
                <span class="count-badge ml-2">{{ pendingCount() }}</span>
              }
            </p-tab>
            <p-tab value="accepted">Accepted</p-tab>
            <p-tab value="dismissed">Dismissed</p-tab>
            <p-tab value="all">All</p-tab>
          </p-tablist>
        </p-tabs>
        <div class="toolbar">
          <div class="toolbar-search">
            <app-toolbar-search-field placeholder="Search by name, email or organization…" ariaLabel="Search submissions" [(ngModel)]="query" />
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" styleClass="table-bordered" [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th>Submitted by</th>
              <th>Organization</th>
              <th>Score</th>
              <th>Profile</th>
              <th>Status</th>
              <th>Submitted</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-r>
            <tr>
              <td><a [routerLink]="['/forms/submissions', r.id]" class="text-primary">{{ r.submitterName ?? r.submitterEmail ?? 'Untitled' }}</a></td>
              <td>{{ r.clientName ?? r.submitterOrganization ?? '' }}</td>
              <td>{{ r.percent === null ? '' : round(r.percent) + '%' }}</td>
              <td>{{ r.bandLabel ?? '' }}</td>
              <td><p-tag [value]="statusTag[r.status].label" [severity]="statusTag[r.status].severity" /></td>
              <td>{{ r.createdAt | date: 'MMM d, y, h:mm a' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6">{{ loading() ? '' : tab() === 'pending' ? 'Nothing waiting for review.' : 'No submissions here.' }}</td></tr>
          </ng-template>
        </p-table>
      </div>
    </app-page>
  `,
})
export class FormSubmissionsPage implements OnInit {
  private readonly forms = inject(FormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ws = inject(FormWorkspaceService);

  readonly formId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly statusTag = SUBMISSION_STATUS_TAG;

  items = signal<FormSubmissionListItemDto[]>([]);
  pendingCount = signal(0);
  formName = signal('');
  loading = signal(true);
  error = signal<string | null>(null);
  tab = signal<Tab>('pending');
  query = '';

  round(n: number) {
    return Math.round(n);
  }

  filtered() {
    const q = this.query.trim().toLowerCase();
    if (!q) return this.items();
    return this.items().filter((r) => [r.submitterName, r.submitterEmail, r.submitterOrganization, r.clientName].some((v) => v?.toLowerCase().includes(q)));
  }

  async ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('tab') as Tab | null;
    if (t && t in TAB_STATUS) this.tab.set(t);
    if (this.ws.form()?.id !== this.formId) this.ws.form.set(null);
    try {
      const f = await this.forms.form(this.formId);
      this.ws.form.set(f);
      this.formName.set(f.name);
    } catch {
      // The list below reports the error.
    }
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const res = await this.forms.submissions(this.formId, TAB_STATUS[this.tab()]);
      this.items.set(res.items);
      this.pendingCount.set(res.pendingCount);
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(value: string | number | undefined) {
    const tab = (typeof value === 'string' && value in TAB_STATUS ? value : 'pending') as Tab;
    this.tab.set(tab);
    void this.router.navigate([], { queryParams: { tab: tab === 'pending' ? null : tab }, replaceUrl: true });
    void this.load();
  }
}
