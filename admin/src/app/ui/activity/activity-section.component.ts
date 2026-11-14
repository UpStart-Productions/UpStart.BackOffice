import { Component, computed, effect, inject, input, model, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { SessionService } from '../../core/session.service';
import {
  activityFeedListKey,
  listViewFilterBool,
  listViewFilterString,
  patchListViewPrefs,
  readListViewPrefs,
} from '../../core/list-view-prefs.storage';
import { loadListSearch, saveListSearch } from '../../core/list-view-prefs.util';
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
    <div class="activity-section" [class.card]="wrapCard()">
      @if (wrapCard()) {
        <h3 class="showcase-section-title mb-3">Activity</h3>
      }
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
          [infiniteScroll]="infiniteScroll()"
          [pageSize]="pageSize()"
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
  private readonly session = inject(SessionService);

  /** Record pages: same white `card` panel as forms and attachments. Activity page already has an outer card. */
  wrapCard = input(true);

  /** Main Activity page: global feed with optional org/person narrow. */
  global = input(false);
  clientId = input<string | null>(null);
  leadId = input<string | null>(null);
  contactId = input<string | null>(null);
  organizationName = input<string | undefined>(undefined);
  /** Next-action row on quick log (organization timelines only; hide on person for parity). */
  showNextActionOnQuickLog = input(true);
  /** Activity → All activity: load older items on scroll (not record-page timelines). */
  infiniteScroll = input(false);
  /** Page size when {@link infiniteScroll} is on (server `limit`). */
  pageSize = input(5);

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

  private contextKey(): string {
    const g = this.global();
    const c = this.clientId();
    const l = this.leadId();
    const k = this.contactId();
    return `${g ? 'g' : 'r'}:${c ?? ''}:${l ?? ''}:${k ?? ''}`;
  }

  private listKey(): string {
    return activityFeedListKey(this.contextKey());
  }

  private persistFeedPrefs() {
    const filters: Record<string, string | boolean> = {};
    const loggedBy = this.loggedBy();
    if (loggedBy) filters['loggedBy'] = loggedBy;
    if (this.from()) filters['from'] = this.from();
    if (this.to()) filters['to'] = this.to();
    const type = this.typeFilter();
    if (type !== 'ALL') filters['typeFilter'] = type;
    if (this.showIncludePeopleToggle() && !this.includePeople()) filters['includePeople'] = 'false';
    if (this.filtersOpen()) filters['filtersOpen'] = 'true';
    patchListViewPrefs(this.session.me()?.id, this.listKey(), {
      search: this.timelineQuery().trim() || undefined,
      filters: Object.keys(filters).length ? filters : undefined,
    });
  }

  private applyFeedPrefsFromStorage() {
    const prefs = readListViewPrefs(this.session.me()?.id, this.listKey());
    const search = loadListSearch(this.session, this.listKey());
    this.timelineSearchDraft = search;
    this.timelineQuery.set(search);
    const loggedBy = listViewFilterString(prefs, 'loggedBy');
    this.loggedBy.set(loggedBy);
    this.from.set(listViewFilterString(prefs, 'from') ?? '');
    this.to.set(listViewFilterString(prefs, 'to') ?? '');
    const type = listViewFilterString(prefs, 'typeFilter') as ActivityToolbarTypeFilter | null;
    if (type && ['ALL', 'EMAIL', 'CALL', 'MEETING', 'NOTE'].includes(type)) {
      this.typeFilter.set(type);
    } else {
      this.typeFilter.set('ALL');
    }
    const includePeople = listViewFilterBool(prefs, 'includePeople');
    this.includePeople.set(includePeople === false ? false : true);
    this.filtersOpen.set(prefs.filters?.['filtersOpen'] === 'true' || prefs.filters?.['filtersOpen'] === true);
  }

  constructor() {
    effect(() => {
      const key = this.contextKey();
      if (this.lastContextKey === null) {
        this.lastContextKey = key;
        untracked(() => this.applyFeedPrefsFromStorage());
        return;
      }
      if (key === this.lastContextKey) return;
      this.lastContextKey = key;
      untracked(() => {
        if (this.searchTimer) {
          clearTimeout(this.searchTimer);
          this.searchTimer = null;
        }
        this.applyFeedPrefsFromStorage();
      });
    });
    effect(() => {
      this.loggedBy();
      this.from();
      this.to();
      this.typeFilter();
      this.includePeople();
      this.filtersOpen();
      this.timelineQuery();
      untracked(() => this.persistFeedPrefs());
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
      saveListSearch(this.session, this.listKey(), value);
    }, 300);
  }
}
