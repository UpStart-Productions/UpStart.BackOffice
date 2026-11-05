import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import type { ClientFormOptionDto, ClientFormResultListItemDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ClientFormsApi } from '../../core/client-forms.api';


/**
 * Client page side card: the client's filled-in forms, and Add form (any client form
 * the role can edit). A form with one living copy opens the existing copy instead of adding another.
 */
@Component({
  selector: 'app-client-forms-panel',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, SelectModule, TagModule, AppDialogModule],
  template: `
    @if (loaded() && (results().length || options().length)) {
      <div class="card card--side">
        <div class="card-header">
          <h3 class="card-title">Forms</h3>
          @if (addable().length) {
            <p-button label="Add form" icon="pi pi-plus" size="small" severity="secondary" (onClick)="openAdd()" />
          }
        </div>
        <div class="side-list">
          @for (r of results(); track r.id) {
            <div class="side-list-row">
              <div class="side-list-body">
                <a class="side-list-title" [routerLink]="r.isClientForm ? ['/forms/results', r.id] : ['/forms/submissions', r.id]">{{ r.formName }}</a>
                <span class="side-list-detail">{{ r.copies === 'living' ? 'Updated ' + (r.updatedAt | date: 'MMM d, y') : (r.createdAt | date: 'MMM d, y') }}</span>
              </div>
              @if (r.submittedAt) {
                <p-tag value="Submitted" severity="success" />
              } @else {
                <p-tag value="In progress" severity="info" />
              }
            </div>
          } @empty {
            <p class="side-list-empty m-0">No forms yet.</p>
          }
        </div>
      </div>
    }

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
export class ClientFormsPanelComponent {
  private readonly api = inject(ClientFormsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  clientId = input.required<string>();

  results = signal<ClientFormResultListItemDto[]>([]);
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
