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

type Group = { category: string; results: ClientFormResultListItemDto[] };

/**
 * Client page side card: the client's filled-in client forms, grouped by category, and Add form (any client form
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
          @if (options().length) {
            <p-button label="Add form" icon="pi pi-plus" size="small" severity="secondary" (onClick)="openAdd()" />
          }
        </div>
        @for (g of groups(); track g.category) {
          @if (groups().length > 1 || g.category) {
            <div class="side-list-detail mt-2">{{ g.category || 'Other' }}</div>
          }
          <div class="side-list">
            @for (r of g.results; track r.id) {
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
            }
          </div>
        } @empty {
          <p class="side-list-empty m-0">No forms yet.</p>
        }
      </div>
    }

    <p-dialog header="Add form" [(visible)]="addVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
      <div class="form-field">
        <label for="cfAddForm">Form</label>
        <p-select
          inputId="cfAddForm"
          [options]="hasCategories() ? groupedOptions() : options()"
          optionLabel="name"
          optionValue="formId"
          [group]="hasCategories()"
          optionGroupLabel="label"
          optionGroupChildren="items"
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

  /** Results grouped by category (categories in name order, uncategorized last). */
  readonly groups = computed<Group[]>(() => {
    const by = new Map<string, ClientFormResultListItemDto[]>();
    for (const r of this.results()) {
      const key = r.category ?? '';
      by.set(key, [...(by.get(key) ?? []), r]);
    }
    return [...by.entries()]
      .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))
      .map(([category, results]) => ({ category, results }));
  });
  readonly hasCategories = computed(() => this.options().some((o) => !!o.category));
  readonly groupedOptions = computed(() => {
    const by = new Map<string, ClientFormOptionDto[]>();
    for (const o of this.options()) by.set(o.category ?? 'Other', [...(by.get(o.category ?? 'Other') ?? []), o]);
    return [...by.entries()].map(([label, items]) => ({ label, items }));
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
