import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  output,
  signal,
  viewChild,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AutoComplete, AutoCompleteModule } from 'primeng/autocomplete';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
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
  imports: [FormsModule, AutoCompleteModule, IconFieldModule, InputIconModule],
  template: `
    <div
      class="layout-topbar-search"
      [class.is-expanded]="expanded()"
      #searchHost
    >
      <button
        type="button"
        class="nav-search-btn layout-topbar-action"
        (click)="open($event)"
        aria-label="Search"
        title="Search"
        [attr.aria-expanded]="expanded()"
        [class.is-hidden]="expanded()"
      >
        <i class="pi pi-search"></i>
      </button>
      <div class="topbar-search-field search-input-with-clear">
        <p-iconfield iconPosition="left">
          <p-inputicon>
            <i class="pi pi-search"></i>
          </p-inputicon>
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
            [showClear]="false"
            [showEmptyMessage]="true"
            scrollHeight="none"
            appendTo="body"
            placeholder="Search clients, projects, invoices, leads…"
            styleClass="global-search-autocomplete"
            panelStyleClass="global-search-panel"
            emptyMessage="No results found"
            (completeMethod)="onComplete($event)"
            (onSelect)="onSelect($event)"
            (keydown.escape)="close()"
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
        </p-iconfield>
        @if (query) {
          <button
            type="button"
            class="search-clear-inside"
            (click)="clearQuery($event)"
            aria-label="Clear search"
          >
            <svg class="search-clear-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="12" fill="currentColor" />
              <path
                d="M8.25 8.25l7.5 7.5M15.75 8.25l-7.5 7.5"
                fill="none"
                stroke="#fff"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        flex-shrink: 0;
      }
    `,
  ],
})
export class GlobalSearchComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly opened = output<void>();

  @ViewChild('globalSearchAc') private autocomplete?: AutoComplete;
  private readonly searchHostRef = viewChild<ElementRef<HTMLElement>>('searchHost');

  readonly expanded = signal(false);
  private suppressCloseUntil = 0;

  query = '';
  groups: SearchResultGroup[] = [];

  open(event: Event) {
    event.stopPropagation();
    if (this.expanded()) {
      this.focusInput();
      return;
    }
    this.suppressCloseUntil = Date.now() + 250;
    this.expanded.set(true);
    this.opened.emit();
    queueMicrotask(() => this.focusInput());
  }

  close() {
    if (!this.expanded()) return;
    this.expanded.set(false);
    this.query = '';
    this.applySuggestions([]);
    this.autocomplete?.hide();
    this.autocomplete?.inputEL?.nativeElement?.blur();
  }

  clearQuery(event: Event) {
    event.stopPropagation();
    this.query = '';
    this.applySuggestions([]);
    this.autocomplete?.hide();
    this.focusInput();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.expanded()) return;
    if (Date.now() < this.suppressCloseUntil) return;
    const host = this.searchHostRef()?.nativeElement;
    if (host?.contains(event.target as Node)) return;
    const panel = document.querySelector('.p-autocomplete-overlay.global-search-panel');
    if (panel?.contains(event.target as Node)) return;
    this.close();
  }

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
    this.close();
  }

  private focusInput() {
    this.autocomplete?.inputEL?.nativeElement?.focus();
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
