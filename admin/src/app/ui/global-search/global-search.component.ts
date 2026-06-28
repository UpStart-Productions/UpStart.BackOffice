import { ChangeDetectorRef, Component, inject, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete';
import { ApiService } from '../../core/api.service';

type SearchResultType = 'client' | 'project' | 'invoice' | 'lead';

type SearchResultItem = {
  type: SearchResultType;
  id: string;
  label: string;
  detail: string;
  meta: string | null;
  status?: string;
};

type SearchResultGroup = {
  label: string;
  type: SearchResultType;
  items: SearchResultItem[];
};

@Component({
  selector: 'app-global-search',
  standalone: true,
  imports: [FormsModule, AutoCompleteModule],
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .global-search-wrap {
      position: relative;
      width: 100%;
    }

    .global-search-icon {
      position: absolute;
      left: 0.75rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text-color-secondary);
      pointer-events: none;
      z-index: 1;
    }

    :host ::ng-deep .global-search-input {
      width: 100%;
    }

    :host ::ng-deep .global-search-input .p-autocomplete-input {
      width: 100%;
      padding-left: 2.25rem;
    }

    .global-search-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
      white-space: normal;
      line-height: 1.35;
      padding: 0.125rem 0;
    }

    .global-search-item-label {
      font-weight: 500;
    }

    .global-search-item-detail,
    .global-search-item-meta {
      font-size: 0.8125rem;
      color: var(--text-color-secondary);
    }
  `,
  template: `
    <div class="global-search-wrap">
      <i class="pi pi-search global-search-icon" aria-hidden="true"></i>
      <p-autocomplete
        #globalSearchAc
        inputId="globalSearch"
        [(ngModel)]="query"
        [suggestions]="groups"
        [group]="true"
        optionGroupLabel="label"
        optionGroupChildren="items"
        [minLength]="2"
        [delay]="250"
        [showClear]="true"
        [showEmptyMessage]="true"
        scrollHeight="none"
        appendTo="body"
        placeholder="Search clients, projects, invoices, leads…"
        styleClass="global-search-input w-full"
        panelStyleClass="global-search-panel"
        emptyMessage="No results found"
        (completeMethod)="onComplete($event)"
        (onSelect)="onSelect($event)"
      >
        <ng-template let-group #group>
          <div class="global-search-group-heading">{{ group.label }}</div>
        </ng-template>
        <ng-template let-item #item>
          <div class="global-search-item">
            <span class="global-search-item-label">{{ item.label }}</span>
            @if (item.detail) {
              <span class="global-search-item-detail">{{ item.detail }}</span>
            }
            @if (item.meta) {
              <span class="global-search-item-meta">{{ item.meta }}</span>
            }
          </div>
        </ng-template>
        <ng-template #empty>
          <div class="global-search-empty">No results found</div>
        </ng-template>
      </p-autocomplete>
    </div>
  `,
})
export class GlobalSearchComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  @ViewChild('globalSearchAc') private autocomplete?: AutoComplete;

  query = '';
  groups: SearchResultGroup[] = [];

  async onComplete(event: { query: string }) {
    const q = event.query.trim();
    if (q.length < 2) {
      this.applySuggestions([]);
      return;
    }

    try {
      const result = await this.api.get<{ groups: SearchResultGroup[] }>(
        `/search?q=${encodeURIComponent(q)}`,
      );
      this.applySuggestions(result.groups ?? []);
    } catch {
      this.applySuggestions([]);
    }
  }

  onSelect(event: { value: SearchResultItem }) {
    const item = event.value;
    if (!item?.id || !item.type) return;

    void this.router.navigateByUrl(this.routeFor(item));
    this.query = '';
    this.applySuggestions([]);
  }

  private applySuggestions(groups: SearchResultGroup[]) {
    this.groups = [...groups];
    const ac = this.autocomplete;
    if (ac) {
      ac.suggestions = this.groups;
      if (ac.loading) {
        ac.handleSuggestionsChange();
      } else if (this.groups.length === 0 && this.query.trim().length >= 2) {
        ac.show();
      }
    }
    this.cdr.detectChanges();
  }

  private routeFor(item: SearchResultItem): string {
    switch (item.type) {
      case 'client':
        return `/clients/${item.id}`;
      case 'project':
        return `/projects/${item.id}`;
      case 'invoice':
        return item.status === 'DRAFT'
          ? `/invoices/${item.id}/edit`
          : `/invoices/${item.id}`;
      case 'lead':
        return `/pipeline/${item.id}`;
    }
  }
}
