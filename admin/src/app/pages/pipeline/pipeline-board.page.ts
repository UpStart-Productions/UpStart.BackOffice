import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ApiError, ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PipelineLane, PipelinesApi, PipelineSummary } from '../../core/pipelines.api';
import { RowActionsMenuComponent, RowActionItem } from '../../ui/row-actions-menu/row-actions-menu.component';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { daysSince, isOverdue, lastContactLabel } from '../../core/staleness.util';
import { AutofocusDirective } from '../../ui/autofocus.directive';
import { PersonComponent } from '../../ui/person/person.component';

export type Lead = {
  id: string;
  organization: string;
  primaryContact?: string;
  primaryContactId?: string | null;
  contactAvatarUrl?: string | null;
  contactRole?: string;
  email?: string;
  /** Legacy fixed stage; lanes are `stageId`. */
  stage: string;
  pipelineId?: string | null;
  stageId?: string | null;
  archivedAt?: string | null;
  source?: string;
  category?: string;
  nextAction?: string;
  nextActionDate?: string;
  lastContactDate?: string | null;
  serviceInterests: string[];
  clientId?: string | null;
  client?: { id: string; name: string; journey: string } | null;
};

type View = 'board' | 'archived';
type CardContact = {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
  isLeadContact: boolean;
};
type NameDialog = { mode: 'new' | 'rename'; value: string } | null;

@Component({
  selector: 'app-pipeline-board-page',
  standalone: true,
  imports: [PersonComponent, 
    FormsModule,
    DragDropModule,
    RouterLink,
    ButtonModule,
    ToolbarSearchFieldComponent,
    InputTextModule,
    TagModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TooltipModule,
    AppDialogModule,
    PageComponent,
    RowActionsMenuComponent,
    CopyEmailComponent,
    AutofocusDirective,
  ],
  templateUrl: './pipeline-board.page.html',
  styleUrl: './pipeline-board.page.scss',
})
export class PipelineBoardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly pipelinesApi = inject(PipelinesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);
  private readonly session = inject(SessionService);

  /** What the user's role allows here (the API enforces the same). */
  readonly canCreate = computed(() => this.session.can('pipeline', 'create'));
  readonly canEdit = computed(() => this.session.can('pipeline', 'edit'));
  readonly canDelete = computed(() => this.session.can('pipeline', 'delete'));
  readonly canSetup = computed(() => this.session.can('pipeline', 'setup'));

  readonly viewOptions = [
    { label: 'Board', value: 'board' },
    { label: 'Archived', value: 'archived' },
  ];

  pipelines = signal<PipelineSummary[]>([]);
  pipelineId = signal<string | null>(null);
  view = signal<View>('board');
  leads = signal<Lead[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');

  /** Lane being renamed in place, and its draft name. */
  editingLaneId = signal<string | null>(null);
  laneDraft = '';
  /** "Add lane" input at the end of the board. */
  addingLane = signal(false);
  newLaneName = '';
  /** Remove-lane dialog. */
  removingLane = signal<PipelineLane | null>(null);
  removeMoveTo: string | null = null;
  removeNeedsTarget = signal(false);
  busy = signal(false);
  /** "View contacts" modal for a card. */
  contactsLead = signal<Lead | null>(null);
  cardContacts = signal<CardContact[]>([]);
  contactsAccount = signal<string | null>(null);
  contactsLoading = signal(false);
  contactsError = signal<string | null>(null);
  readonly canOpenContacts = computed(() => this.session.can('contacts', 'view'));
  /** New / rename pipeline dialog. */
  nameDialog = signal<NameDialog>(null);

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private suppressCardClick = false;

  readonly lastContactLabel = lastContactLabel;

  readonly current = computed(() => this.pipelines().find((p) => p.id === this.pipelineId()) ?? null);
  readonly lanes = computed(() => this.current()?.stages ?? []);
  readonly laneListIds = computed(() => this.lanes().map((l) => `lane-${l.id}`));
  readonly laneNames = computed(() => new Map(this.pipelines().flatMap((p) => p.stages.map((s) => [s.id, s.name] as const))));

  readonly filteredLeads = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.leads();
    if (!q) return list;
    return list.filter((lead) => this.leadMatchesSearch(lead, q));
  });

  /** Cards per lane; a card whose lane is gone shows in the first lane. */
  private readonly cardsByLane = computed(() => {
    const lanes = this.lanes();
    const known = new Set(lanes.map((l) => l.id));
    const fallback = lanes[0]?.id;
    const map = new Map<string, Lead[]>();
    for (const lead of this.filteredLeads()) {
      const key = lead.stageId && known.has(lead.stageId) ? lead.stageId : fallback;
      if (!key) continue;
      map.set(key, [...(map.get(key) ?? []), lead]);
    }
    return map;
  });

  leadsForLane = (laneId: string) => this.cardsByLane().get(laneId) ?? [];

  readonly pipelineActions = computed<RowActionItem[]>(() => [
    { id: 'new', label: 'New pipeline', icon: 'pi pi-plus', command: () => this.nameDialog.set({ mode: 'new', value: '' }) },
    {
      id: 'rename',
      label: 'Rename pipeline',
      icon: 'pi pi-pencil',
      disabled: !this.current(),
      command: () => this.nameDialog.set({ mode: 'rename', value: this.current()?.name ?? '' }),
    },
    {
      id: 'delete',
      label: 'Delete pipeline',
      icon: 'pi pi-trash',
      severity: 'danger',
      disabled: this.pipelines().length <= 1,
      command: () => this.confirmDeletePipeline(),
    },
  ]);

  async ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    if (params.get('view') === 'archived') this.view.set('archived');
    await this.loadPipelines(params.get('pipeline'));
    await this.loadLeads();
  }

  // ---------- loading ----------

  private async loadPipelines(prefer?: string | null) {
    try {
      const list = await this.pipelinesApi.list();
      this.pipelines.set(list);
      const keep = prefer ?? this.pipelineId();
      this.pipelineId.set(list.find((p) => p.id === keep)?.id ?? list[0]?.id ?? null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load pipelines');
    }
  }

  async loadLeads() {
    const pid = this.pipelineId();
    this.loading.set(true);
    try {
      const archived = this.view() === 'archived' ? '&archived=true' : '';
      this.leads.set(pid ? await this.api.get<Lead[]>(`/leads?pipelineId=${pid}${archived}`) : []);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      this.loading.set(false);
    }
  }

  private syncUrl() {
    const pid = this.pipelineId();
    const first = this.pipelines()[0]?.id;
    void this.router.navigate([], {
      queryParams: { pipeline: pid && pid !== first ? pid : null, view: this.view() === 'archived' ? 'archived' : null },
      replaceUrl: true,
    });
  }

  async selectPipeline(id: string) {
    this.pipelineId.set(id);
    this.syncUrl();
    await this.loadLeads();
  }

  async setView(view: View) {
    this.view.set(view);
    this.syncUrl();
    await this.loadLeads();
  }

  // ---------- search ----------

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced.set('');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private leadMatchesSearch(lead: Lead, q: string): boolean {
    const haystack = [
      lead.organization,
      lead.primaryContact,
      lead.contactRole,
      lead.email,
      lead.nextAction,
      lead.source,
      lead.category,
      ...lead.serviceInterests,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  // ---------- cards ----------

  openLead(id: string) {
    if (this.suppressCardClick) return;
    void this.router.navigate(['/pipeline', id]);
  }

  onDragStarted() {
    this.suppressCardClick = true;
  }

  onDragEnded() {
    setTimeout(() => {
      this.suppressCardClick = false;
    }, 0);
  }

  /** "No contact", "Contacted today", "Contacted 1 day ago", "Contacted 123 days ago". */
  contactedLabel(lead: Lead): string {
    const days = daysSince(lead.lastContactDate);
    if (days === null) return 'No contact';
    if (days === 0) return 'Contacted today';
    return `Contacted ${days} day${days === 1 ? '' : 's'} ago`;
  }

  isOverdueLead(lead: Lead): boolean {
    return isOverdue(lead.nextActionDate);
  }

  overdueTip(lead: Lead): string {
    return `Next step overdue (due ${this.formatDate(lead.nextActionDate!)})`;
  }

  async openContacts(lead: Lead) {
    this.contactsLead.set(lead);
    this.cardContacts.set([]);
    this.contactsAccount.set(null);
    this.contactsError.set(null);
    this.contactsLoading.set(true);
    try {
      const res = await this.api.get<{ accountName: string | null; contacts: CardContact[] }>(`/leads/${lead.id}/contacts`);
      this.cardContacts.set(res.contacts);
      this.contactsAccount.set(res.accountName);
    } catch (err) {
      this.contactsError.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Could not load contacts');
    } finally {
      this.contactsLoading.set(false);
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  onCardDrop(event: CdkDragDrop<string>) {
    const lead = event.item.data as Lead;
    const target = event.container.data;
    if (!lead || lead.stageId === target) return;
    void this.moveCard(lead, target);
  }

  private async moveCard(lead: Lead, stageId: string) {
    const previous = lead.stageId ?? null;
    this.patchLead(lead.id, { stageId });
    try {
      await this.api.put(`/leads/${lead.id}`, { stageId });
      this.toast.add({
        severity: 'success',
        summary: 'Moved',
        detail: `"${lead.organization}" moved to ${this.laneNames().get(stageId) ?? 'lane'}`,
        life: 2500,
      });
      void this.refreshCounts();
    } catch (err) {
      this.patchLead(lead.id, { stageId: previous });
      this.error.set(err instanceof Error ? err.message : 'Failed to move card');
    }
  }

  private patchLead(id: string, patch: Partial<Lead>) {
    this.leads.update((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  getRowActions(lead: Lead): RowActionItem[] {
    const open: RowActionItem = { id: 'open', label: 'Open', icon: 'pi pi-arrow-right', command: () => this.router.navigate(['/pipeline', lead.id]) };
    const contacts: RowActionItem = { id: 'contacts', label: 'View people', icon: 'pi pi-users', command: () => this.openContacts(lead) };
    const del: RowActionItem = { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(lead) };
    if (this.view() === 'archived') {
      return [
        open,
        contacts,
        ...(this.canEdit() ? [{ id: 'restore', label: 'Restore to board', icon: 'pi pi-replay', command: () => this.restore(lead) }] : []),
        ...(this.canDelete() ? [del] : []),
      ];
    }
    const actions: RowActionItem[] = [open, contacts];
    if (!this.canEdit()) return this.canDelete() ? [...actions, del] : actions;
    if (lead.client?.journey !== 'CLIENT') {
      actions.push({
        id: 'convert',
        label: 'Make client',
        icon: 'pi pi-user-plus',
        command: () => this.router.navigate(['/pipeline', lead.id], { queryParams: { convert: '1' } }),
      });
    }
    actions.push({ id: 'archive', label: 'Archive', icon: 'pi pi-inbox', command: () => this.archive(lead) });
    if (this.canDelete()) actions.push(del);
    return actions;
  }

  async archive(lead: Lead) {
    try {
      await this.api.post(`/leads/${lead.id}/archive`, {});
      this.leads.update((list) => list.filter((l) => l.id !== lead.id));
      this.toast.add({ severity: 'success', summary: 'Archived', detail: `"${lead.organization}" is off the board. Find it under Archived.`, life: 3000 });
      void this.refreshCounts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Archive failed');
    }
  }

  async restore(lead: Lead) {
    try {
      await this.api.post(`/leads/${lead.id}/restore`, {});
      this.leads.update((list) => list.filter((l) => l.id !== lead.id));
      this.toast.add({ severity: 'success', summary: 'Restored', detail: `"${lead.organization}" is back on the board.`, life: 3000 });
      void this.refreshCounts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Restore failed');
    }
  }

  confirmDelete(lead: Lead) {
    this.deleteConfirm.confirm({
      message: `Delete "${lead.organization}"? This cannot be undone. Archive keeps it instead.`,
      accept: async () => {
        try {
          await this.api.delete(`/leads/${lead.id}`);
          this.leads.update((list) => list.filter((l) => l.id !== lead.id));
          void this.refreshCounts();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }

  private async refreshCounts() {
    try {
      this.pipelines.set(await this.pipelinesApi.list());
    } catch {
      /* counts are cosmetic */
    }
  }

  // ---------- lanes ----------

  startLaneEdit(lane: PipelineLane) {
    if (!this.canSetup()) return;
    this.editingLaneId.set(lane.id);
    this.laneDraft = lane.name;
  }

  cancelLaneEdit() {
    this.editingLaneId.set(null);
  }

  async saveLaneName(lane: PipelineLane) {
    if (this.editingLaneId() !== lane.id) return;
    const name = this.laneDraft.trim();
    this.editingLaneId.set(null);
    if (!name || name === lane.name) return;
    this.updateLaneLocal(lane.id, { name });
    try {
      await this.pipelinesApi.renameLane(lane.id, name);
    } catch (err) {
      this.updateLaneLocal(lane.id, { name: lane.name });
      this.error.set(err instanceof Error ? err.message : 'Rename failed');
    }
  }

  private updateLaneLocal(id: string, patch: Partial<PipelineLane>) {
    this.pipelines.update((list) =>
      list.map((p) => ({ ...p, stages: p.stages.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
    );
  }

  async addLane() {
    const pid = this.pipelineId();
    const name = this.newLaneName.trim();
    if (!pid || !name) return;
    this.busy.set(true);
    try {
      await this.pipelinesApi.addLane(pid, name);
      this.newLaneName = '';
      this.addingLane.set(false);
      await this.refreshCounts();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not add lane');
    } finally {
      this.busy.set(false);
    }
  }

  onLaneDrop(event: CdkDragDrop<PipelineLane[]>) {
    const pid = this.pipelineId();
    const lanes = [...this.lanes()];
    const to = Math.min(event.currentIndex, lanes.length - 1);
    if (!pid || event.previousIndex === to) return;
    moveItemInArray(lanes, event.previousIndex, to);
    const reordered = lanes.map((l, i) => ({ ...l, sortOrder: i }));
    this.pipelines.update((list) => list.map((p) => (p.id === pid ? { ...p, stages: reordered } : p)));
    this.pipelinesApi.reorderLanes(pid, reordered.map((l) => l.id)).catch(async (err) => {
      this.error.set(err instanceof Error ? err.message : 'Could not reorder lanes');
      await this.refreshCounts();
    });
  }

  laneActions(lane: PipelineLane): RowActionItem[] {
    return [
      { id: 'rename', label: 'Rename lane', icon: 'pi pi-pencil', command: () => this.startLaneEdit(lane) },
      {
        id: 'remove',
        label: 'Remove lane',
        icon: 'pi pi-trash',
        severity: 'danger',
        disabled: this.lanes().length <= 1,
        command: () => this.openRemoveLane(lane),
      },
    ];
  }

  /** Lanes the cards of `lane` can move to (the other lanes of this pipeline). */
  otherLanes(lane: PipelineLane | null): PipelineLane[] {
    return lane ? this.lanes().filter((l) => l.id !== lane.id) : [];
  }

  openRemoveLane(lane: PipelineLane) {
    this.removingLane.set(lane);
    this.removeNeedsTarget.set(lane.cardCount > 0 || this.leadsForLane(lane.id).length > 0);
    this.removeMoveTo = this.otherLanes(lane)[0]?.id ?? null;
  }

  async confirmRemoveLane() {
    const lane = this.removingLane();
    if (!lane) return;
    this.busy.set(true);
    try {
      const res = await this.pipelinesApi.removeLane(lane.id, this.removeNeedsTarget() ? this.removeMoveTo ?? undefined : undefined);
      this.removingLane.set(null);
      this.toast.add({
        severity: 'success',
        summary: 'Lane removed',
        detail: res.moved ? `${res.moved} card${res.moved === 1 ? '' : 's'} moved to ${this.laneNames().get(this.removeMoveTo ?? '') ?? 'another lane'}.` : `"${lane.name}" removed.`,
        life: 3000,
      });
      await this.refreshCounts();
      await this.loadLeads();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not remove lane';
      if (err instanceof ApiError && err.status === 409) {
        // It holds archived cards: ask where they go.
        this.removeNeedsTarget.set(true);
      } else {
        this.removingLane.set(null);
        this.error.set(msg);
      }
    } finally {
      this.busy.set(false);
    }
  }

  // ---------- pipelines ----------

  async saveNameDialog() {
    const dlg = this.nameDialog();
    const name = dlg?.value.trim();
    if (!dlg || !name) return;
    this.busy.set(true);
    try {
      if (dlg.mode === 'new') {
        const created = await this.pipelinesApi.create(name);
        await this.loadPipelines(created.id);
        this.syncUrl();
        await this.loadLeads();
      } else if (this.pipelineId()) {
        await this.pipelinesApi.rename(this.pipelineId()!, name);
        await this.refreshCounts();
      }
      this.nameDialog.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not save pipeline');
    } finally {
      this.busy.set(false);
    }
  }

  setNameDraft(value: string) {
    const dlg = this.nameDialog();
    if (dlg) this.nameDialog.set({ ...dlg, value });
  }

  private confirmDeletePipeline() {
    const p = this.current();
    if (!p) return;
    this.deleteConfirm.confirm({
      message: `Delete the "${p.name}" pipeline? Only an empty pipeline (no cards, archived included) can be deleted.`,
      accept: async () => {
        try {
          await this.pipelinesApi.remove(p.id);
          await this.loadPipelines(null);
          this.syncUrl();
          await this.loadLeads();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Could not delete pipeline');
        }
      },
    });
  }
}
