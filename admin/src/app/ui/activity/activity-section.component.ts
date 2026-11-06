import { Component, computed, effect, inject, input, model, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivityFeedFilter, CommunicationsApi, TeamMember } from '../../core/communications.api';
import { PeopleDirectoryOption, teamUsersToOptions } from '../../pages/projects/people-directory.util';
import { ActivityTimelineComponent } from './activity-timeline.component';
import { ActivityToolbarPanelComponent, ActivityToolbarTypeFilter } from './activity-toolbar-panel.component';

function startOfDayIso(key: string): string | null {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

function endOfDayIso(key: string): string | null {
  if (!key) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

/**
 * Full Activity toolbar (search + sliders + filters) plus timeline + quick log — same chrome as
 * Activity → All activity, for record pages and the main Activity tab.
 */
@Component({
  selector: 'app-activity-section',
  standalone: true,
  imports: [FormsModule, ActivityToolbarPanelComponent, ActivityTimelineComponent],
  template: `
    <div class="activity-section">
      <app-activity-toolbar-panel
        variant="full"
        [searchPlaceholder]="searchPlaceholder()"
        [searchDraft]="timelineSearchDraft"
        (searchDraftChange)="onSearchInput($event)"
        [filtersOpen]="filtersOpen()"
        (filtersOpenChange)="filtersOpen.set($event)"
        [activeFilterCount]="filterCount()"
        [teamLoggedByOptions]="teamLoggedByOptions()"
        [loggedByPickId]="loggedBy()"
        (loggedByPickIdChange)="loggedBy.set($event)"
        [fromDate]="from()"
        (fromDateChange)="from.set($event)"
        [toDate]="to()"
        (toDateChange)="to.set($event)"
        [typeFilter]="typeFilter()"
        (typeFilterChange)="typeFilter.set($event)"
        [includePeople]="includePeople()"
        (includePeopleChange)="includePeople.set($event)"
        [showIncludePeopleToggle]="showIncludePeopleToggle()"
      >
        <app-activity-timeline
          [global]="global()"
          [clientId]="sectionClientId()"
          [leadId]="leadId()"
          [contactId]="sectionContactId()"
          [organizationName]="organizationName()"
          [feedFilter]="feedFilter()"
          [hideHeader]="true"
          [showFullViewLink]="false"
          [hideInlineFilters]="true"
          [showNextActionOnQuickLog]="showNextActionOnQuickLog()"
          [(query)]="timelineQuery"
          [(filter)]="typeFilter"
          [(includePeople)]="includePeople"
        />
      </app-activity-toolbar-panel>
    </div>
  `,
  styles: `
    .activity-section {
      margin-top: 0;
    }
  `,
})
export class ActivitySectionComponent implements OnInit, OnDestroy {
  private readonly comms = inject(CommunicationsApi);

  /** Main Activity page: global feed with optional org/person narrow. */
  global = input(false);
  clientId = input<string | null>(null);
  leadId = input<string | null>(null);
  contactId = input<string | null>(null);
  organizationName = input<string | undefined>(undefined);
  /** Next-action row on quick log (organization timelines only; hide on person for parity). */
  showNextActionOnQuickLog = input(true);

  readonly sectionClientId = computed(() => this.clientId());
  readonly sectionContactId = computed(() => {
    if (this.global()) return this.clientId() ? null : this.contactId();
    return this.contactId();
  });

  readonly showIncludePeopleToggle = computed(() =>
    (this.global() && !!this.clientId()) || (!this.global() && !!this.clientId() && !this.leadId()),
  );

  teamMembers = signal<TeamMember[]>([]);
  readonly teamLoggedByOptions = computed(() => teamUsersToOptions(this.teamMembers()));

  loggedBy = signal<string | null>(null);
  from = signal('');
  to = signal('');

  timelineQuery = model('');
  typeFilter = model<ActivityToolbarTypeFilter>('ALL');
  includePeople = model(true);

  filtersOpen = signal(false);
  timelineSearchDraft = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private lastContextKey: string | null = null;

  readonly feedFilter = computed<ActivityFeedFilter>(() => ({
    loggedByUserId: this.loggedBy(),
    from: startOfDayIso(this.from()),
    to: endOfDayIso(this.to()),
  }));

  readonly filterCount = computed(() => {
    let n = 0;
    if (this.loggedBy()) n++;
    if (this.from()) n++;
    if (this.to()) n++;
    if (this.typeFilter() !== 'ALL') n++;
    if (this.showIncludePeopleToggle() && !this.includePeople()) n++;
    return n;
  });

  private readonly typeLabel: Record<ActivityToolbarTypeFilter, string> = {
    ALL: 'activity',
    EMAIL: 'emails',
    CALL: 'calls',
    MEETING: 'meetings',
    NOTE: 'notes',
  };

  readonly searchPlaceholder = computed(() => {
    const f = this.typeFilter();
    const name = this.typeLabel[f] ?? 'activity';
    return f === 'ALL' ? 'Search activity…' : `Search ${name}…`;
  });

  constructor() {
    effect(() => {
      const g = this.global();
      const c = this.clientId();
      const l = this.leadId();
      const k = this.contactId();
      const key = `${g ? 'g' : 'r'}:${c ?? ''}:${l ?? ''}:${k ?? ''}`;
      if (this.lastContextKey === null) {
        this.lastContextKey = key;
        return;
      }
      if (key === this.lastContextKey) return;
      this.lastContextKey = key;
      untracked(() => {
        if (this.searchTimer) {
          clearTimeout(this.searchTimer);
          this.searchTimer = null;
        }
        this.filtersOpen.set(false);
        this.loggedBy.set(null);
        this.from.set('');
        this.to.set('');
        this.timelineQuery.set('');
        this.timelineSearchDraft = '';
        this.typeFilter.set('ALL');
        this.includePeople.set(true);
      });
    });
  }

  async ngOnInit() {
    try {
      this.teamMembers.set(await this.comms.team());
    } catch {
      this.teamMembers.set([]);
    }
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  onSearchInput(value: string) {
    this.timelineSearchDraft = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      this.timelineQuery.set(value);
    }, 300);
  }
}
