import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import type { ClientFormOptionDto, ClientFormResultListItemDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ClientFormsApi } from '../../core/client-forms.api';

/**
 * Client page's Records tab: every form submitted for the client (client forms, forms filled in on visits, and
 * other forms' submissions attached here), newest first, and Add form (any client form the role can edit).
 * A form with one living copy opens the existing copy instead of adding another.
 */
@Component({
  selector: 'app-client-records',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, SelectModule, SelectButtonModule, TableModule, TagModule, AppDialogModule],
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
    }
  `,
  template: `
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Records</h2>
        <div class="flex align-items-center gap-2">
          <p-selectbutton [options]="showOptions" optionLabel="label" optionValue="value" [ngModel]="show()" (ngModelChange)="show.set($event)" [allowEmpty]="false" size="small" ariaLabel="Show" />
          @if (addable().length) {
            <p-button label="Add form" icon="pi pi-plus" size="small" severity="secondary" (onClick)="openAdd()" />
          }
        </div>
      </div>
      <p-table [value]="shown()" [loading]="!loaded()" styleClass="table-bordered">
        <ng-template pTemplate="header">
          <tr>
            <th>Form</th>
            <th>Visit</th>
            <th>By</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td>
              <a class="text-primary" [routerLink]="r.isClientForm ? ['/forms/results', r.id] : ['/forms/submissions', r.id]">{{ r.formName }}</a>
            </td>
            <td>
              @if (r.visit; as v) {
                <a class="text-primary" [routerLink]="['/visits', v.id]">{{ v.visitTypeName }}, {{ v.startAt | date: 'MMM d' }}</a>
              }
            </td>
            <td>{{ r.visit?.teamMemberName ?? r.createdByName ?? r.submitterName ?? r.updatedByName ?? '' }}</td>
            <td>{{ (r.submittedAt ?? r.updatedAt) | date: 'MMM d, y' }}</td>
            <td>
              @if (r.submittedAt) {
                <p-tag value="Submitted" severity="success" />
              } @else {
                <p-tag value="In progress" severity="info" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="5">{{ show() === 'all' ? 'No records yet. Forms filled in for this client, on visits or with Add form, show here.' : 'Nothing here with this filter.' }}</td></tr>
        </ng-template>
      </p-table>
    </div>

    @if (addVisible) {
      <p-dialog
        header="Add form"
        [(visible)]="addVisible"
        [modal]="true"
        appendTo="body"
        [style]="{ width: 'min(28rem, 96vw)' }"
      >
        <div class="form-field">
          <label for="cfAddForm">Form</label>
          <p-select
            inputId="cfAddForm"
            [options]="addable()"
            optionLabel="name"
            optionValue="formId"
            [(ngModel)]="addFormId"
            [filter]="true"
            filterBy="name"
            placeholder="Search and select…"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="adding()" (onClick)="addVisible = false" />
          <p-button label="Add" icon="pi pi-check" [loading]="adding()" [disabled]="!addFormId" (onClick)="add()" />
        </ng-template>
      </p-dialog>
    }
  `,
})
export class ClientRecordsComponent {
  private readonly api = inject(ClientFormsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  clientId = input.required<string>();

  results = signal<ClientFormResultListItemDto[]>([]);
  /** All records, only forms filled in on visits, or only client-level forms (intake, profile and the like). */
  readonly showOptions = [
    { value: 'all', label: 'All' },
    { value: 'visit', label: 'Visit forms' },
    { value: 'client', label: 'Client forms' },
  ];
  show = signal<'all' | 'visit' | 'client'>('all');
  readonly shown = computed(() => {
    const show = this.show();
    return this.results().filter((r) => show === 'all' || (show === 'visit') === !!r.visit);
  });
  options = signal<ClientFormOptionDto[]>([]);
  loaded = signal(false);
  addVisible = false;
  addFormId: string | null = null;
  adding = signal(false);

  /** Forms to add: the ones this client doesn't have yet, by name. */
  readonly addable = computed(() => {
    const has = new Set(this.results().map((r) => r.formId));
    return this.options()
      .filter((o) => !has.has(o.formId))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  constructor() {
    effect(() => {
      void this.load(this.clientId());
    });
  }

  private async load(clientId: string) {
    try {
      const res = await this.api.panel(clientId);
      this.results.set(res.results);
      this.options.set(res.options);
    } catch {
      this.results.set([]);
      this.options.set([]);
    } finally {
      this.loaded.set(true);
    }
  }

  openAdd() {
    this.addFormId = null;
    this.addVisible = true;
  }

  async add() {
    if (!this.addFormId) return;
    this.adding.set(true);
    try {
      const { id } = await this.api.create(this.addFormId, this.clientId());
      this.addVisible = false;
      await this.router.navigate(['/forms/results', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.adding.set(false);
    }
  }
}
