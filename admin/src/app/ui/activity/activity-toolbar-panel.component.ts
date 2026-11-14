import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { InteractionType } from '../../core/communications.api';
import { DateInputComponent } from '../date-input/date-input.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { PeopleDirectoryOption } from '../../pages/projects/people-directory.util';
import { PeopleSelectComponent } from '../people-select/people-select.component';
import { ToolbarSearchFieldComponent } from '../toolbar-search-field/toolbar-search-field.component';

export type ActivityToolbarTypeFilter = 'ALL' | InteractionType;

/** Shared options for the activity type filter (full page + org/person timeline). */
export const ACTIVITY_TOOLBAR_TYPE_FILTER_OPTIONS: { label: string; value: ActivityToolbarTypeFilter; icon: string }[] = [
  { label: 'All', value: 'ALL', icon: 'pi-list' },
  { label: 'Emails', value: 'EMAIL', icon: 'pi-envelope' },
  { label: 'Calls', value: 'CALL', icon: 'pi-phone' },
  { label: 'Meetings', value: 'MEETING', icon: 'pi-calendar' },
  { label: 'Notes', value: 'NOTE', icon: 'pi-file-edit' },
];

/**
 * Shared search + filter UI for Activity: full toolbar (sliders + collapsible filters)
 * and optional compact row (`variant="record"`). Embed pages use `variant="full"` via `app-activity-section`.
 */
@Component({
  selector: 'app-activity-toolbar-panel',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    SelectModule,
    DateInputComponent,
    HelpTextComponent,
    PeopleSelectComponent,
    ToolbarSearchFieldComponent,
  ],
  template: `
    @if (variant() === 'full') {
      <div class="activity-toolbar-panel activity-toolbar-panel--full">
        <div class="activity-all-toolbar">
          <app-toolbar-search-field
            class="activity-all-toolbar-search"
            [placeholder]="searchPlaceholder()"
            ariaLabel="Search activity"
            [ngModel]="searchDraft()"
            (ngModelChange)="searchDraftChange.emit($event)"
          />
          <p-button
            type="button"
            class="activity-all-filter-toggle"
            [text]="true"
            severity="secondary"
            [attr.aria-expanded]="filtersOpen()"
            [attr.aria-label]="activeFilterCount() ? 'Show filters, ' + activeFilterCount() + ' active' : 'Show filters'"
            aria-controls="activity-all-filters"
            (onClick)="filtersOpenChange.emit(!filtersOpen())"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="lucide lucide-sliders-horizontal activity-all-filter-toggle-icon"
              aria-hidden="true"
            >
              <line x1="21" x2="14" y1="4" y2="4" />
              <line x1="10" x2="3" y1="4" y2="4" />
              <line x1="21" x2="12" y1="12" y2="12" />
              <line x1="8" x2="3" y1="12" y2="12" />
              <line x1="21" x2="16" y1="20" y2="20" />
              <line x1="12" x2="3" y1="20" y2="20" />
              <line x1="14" x2="14" y1="2" y2="6" />
              <line x1="8" x2="8" y1="10" y2="14" />
              <line x1="16" x2="16" y1="18" y2="22" />
            </svg>
          </p-button>
        </div>
        <div
          class="activity-all-filter-panel-wrap"
          [class.activity-all-filter-panel-wrap--open]="filtersOpen()"
          [attr.aria-hidden]="!filtersOpen()"
        >
          <div class="activity-all-filter-panel-inner">
            <div id="activity-all-filters" class="activity-all-filters">
              <div class="form-field activity-all-filter-field">
                <label for="activityAllLoggedBy">Logged by <app-help-text key="activity.loggedBy" /></label>
                <app-people-select
                  inputId="activityAllLoggedBy"
                  [options]="teamLoggedByOptions()"
                  [pickId]="loggedByPickId()"
                  (pickIdChange)="loggedByPickIdChange.emit($event)"
                  [filterable]="false"
                  placeholder="Anyone"
                  filterPlaceholder="Search…"
                  ariaLabel="Filter by who logged the activity"
                />
              </div>
              <div class="form-field activity-all-filter-field">
                <label for="activityAllFrom">From</label>
                <app-date-input inputId="activityAllFrom" [ngModel]="fromDate()" (ngModelChange)="fromDateChange.emit($event)" />
              </div>
              <div class="form-field activity-all-filter-field">
                <label for="activityAllTo">To</label>
                <app-date-input inputId="activityAllTo" [ngModel]="toDate()" (ngModelChange)="toDateChange.emit($event)" />
              </div>
              <div class="form-field activity-all-filter-field">
                <label for="activityAllType">Type</label>
                <p-select
                  inputId="activityAllType"
                  [options]="typeFilterOptions"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="typeFilter()"
                  (ngModelChange)="typeFilterChange.emit($event)"
                  appendTo="body"
                  styleClass="activity-all-type-select w-full"
                  ariaLabel="Activity type"
                >
                  <ng-template #item let-option>
                    <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
                  </ng-template>
                  <ng-template #selectedItem let-option>
                    <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
                  </ng-template>
                </p-select>
              </div>
              @if (showIncludePeopleToggle()) {
                <div class="activity-all-people-toggle activity-all-filter-field">
                  <p-checkbox
                    inputId="activityAllIncludePeople"
                    [ngModel]="includePeople()"
                    (ngModelChange)="includePeopleChange.emit($event)"
                    [binary]="true"
                  />
                  <label for="activityAllIncludePeople">Include people's activity</label>
                </div>
              }
            </div>
          </div>
        </div>
        <ng-content />
      </div>
    } @else {
      <div class="activity-toolbar-panel activity-toolbar-panel--record">
        <div class="activity-filter">
          <p-select
            [options]="typeFilterOptions"
            optionLabel="label"
            optionValue="value"
            [ngModel]="typeFilter()"
            (ngModelChange)="typeFilterChange.emit($event)"
            appendTo="body"
            styleClass="activity-type-select"
            ariaLabel="Activity type"
          >
            <ng-template #item let-option>
              <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
            </ng-template>
            <ng-template #selectedItem let-option>
              <span class="activity-type-option"><i class="pi {{ option.icon }}" aria-hidden="true"></i>{{ option.label }}</span>
            </ng-template>
          </p-select>
          <div class="activity-search">
            <app-toolbar-search-field
              class="w-full"
              [placeholder]="searchPlaceholder()"
              ariaLabel="Search activity"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQueryChange.emit($event)"
            />
          </div>
          @if (showIncludePeopleToggle()) {
            <div class="activity-people-toggle">
              <p-checkbox
                inputId="includePeopleRecord"
                [ngModel]="includePeople()"
                (ngModelChange)="includePeopleChange.emit($event)"
                [binary]="true"
              />
              <label for="includePeopleRecord">Include people's activity</label>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .activity-all-toolbar {
      display: flex;
      align-items: stretch;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .activity-all-toolbar-search {
      flex: 1 1 auto;
      min-width: 0;
    }
    .activity-all-filter-toggle-icon {
      display: block;
    }
    .activity-all-filter-panel-wrap {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows 0.25s ease;
    }
    .activity-all-filter-panel-wrap--open {
      grid-template-rows: 1fr;
    }
    @media (prefers-reduced-motion: reduce) {
      .activity-all-filter-panel-wrap {
        transition: none;
      }
    }
    .activity-all-filter-panel-inner {
      min-height: 0;
      overflow: hidden;
    }
    .activity-all-filters {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      gap: 1rem;
      padding-bottom: 1rem;
    }
    .activity-all-filter-field {
      flex: 0 0 auto;
      width: 12rem;
      min-width: 10rem;
      max-width: 100%;
      margin-bottom: 0;
    }
    .activity-type-option {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    :host ::ng-deep .activity-all-type-select {
      width: 12.5rem;
    }
    .activity-all-people-toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex: 0 0 auto;
      white-space: nowrap;
      width: auto;
      min-width: 0;
      padding-bottom: 0.25rem;
    }
    .activity-filter {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    .activity-search {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
    }
    .activity-search .toolbar-search-field-host {
      flex: 1 1 auto;
      min-width: 0;
      width: 100%;
    }
    :host ::ng-deep .activity-type-select {
      width: 12.5rem;
      flex: 0 0 auto;
    }
    .activity-people-toggle {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex: 0 0 auto;
      white-space: nowrap;
    }
  `,
})
export class ActivityToolbarPanelComponent {
  readonly typeFilterOptions = ACTIVITY_TOOLBAR_TYPE_FILTER_OPTIONS;

  variant = input<'full' | 'record'>('full');
  /** Full + record: type filter (ALL, EMAIL, …). */
  typeFilter = input.required<ActivityToolbarTypeFilter>();
  typeFilterChange = output<ActivityToolbarTypeFilter>();

  searchPlaceholder = input('Search activity…');

  /** Full page: debounced search draft (parent owns debounce → API query). */
  searchDraft = input('');
  searchDraftChange = output<string>();

  filtersOpen = input(false);
  filtersOpenChange = output<boolean>();

  activeFilterCount = input(0);

  teamLoggedByOptions = input<PeopleDirectoryOption[]>([]);
  loggedByPickId = input<string | null>(null);
  loggedByPickIdChange = output<string | null>();

  fromDate = input('');
  fromDateChange = output<string>();

  toDate = input('');
  toDateChange = output<string>();

  /** Full + record when scoped to an account. */
  includePeople = input(true);
  includePeopleChange = output<boolean>();
  showIncludePeopleToggle = input(false);

  /** Record (timeline): immediate search query. */
  searchQuery = input('');
  searchQueryChange = output<string>();
}
