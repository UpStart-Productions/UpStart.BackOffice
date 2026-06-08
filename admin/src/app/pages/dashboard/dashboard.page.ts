import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { DragDropModule } from 'primeng/dragdrop';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  DashboardWidgetComponent,
  type DashboardWidgetHeight,
  type DashboardWidgetSpan,
} from '../../ui/dashboard-widget/dashboard-widget.component';
import {
  DashboardInvoicesWidgetComponent,
  DashboardPipelineWidgetComponent,
  DashboardProjectsWidgetComponent,
  DashboardTimeTodayWidgetComponent,
} from '../../ui/dashboard-widgets';
import type { Lead } from '../pipeline/pipeline-board.page';
import type { TimeEntry } from '../time-entry/time-entry.types';
import {
  dateKey,
  endOfWeek,
  formatDurationMin,
  startOfWeek,
} from '../time-entry/timesheet.utils';

const STORAGE_KEY = 'admin-dashboard-widget-order';

export interface DashboardWidgetConfig {
  id: string;
  title: string;
  icon?: string;
  iconColor?: 'primary' | 'success' | 'info' | 'warning' | 'danger';
  span: DashboardWidgetSpan;
  height: DashboardWidgetHeight;
}

const DEFAULT_WIDGET_ORDER = ['time-today', 'pipeline', 'invoices', 'projects'];

const DROPPABLE_SCOPE: string[] = [...DEFAULT_WIDGET_ORDER];

const WIDGET_CONFIGS: DashboardWidgetConfig[] = [
  {
    id: 'time-today',
    title: 'Time',
    icon: 'pi-clock',
    iconColor: 'primary',
    span: 1,
    height: 'tall',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    icon: 'pi-chart-bar',
    iconColor: 'success',
    span: 1,
    height: 'tall',
  },
  {
    id: 'invoices',
    title: 'Invoices',
    icon: 'pi-receipt',
    iconColor: 'warning',
    span: 1,
    height: 'short',
  },
  {
    id: 'projects',
    title: 'Active Projects',
    icon: 'pi-briefcase',
    iconColor: 'info',
    span: 2,
    height: 'short',
  },
];

type Invoice = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  client: { id: string; name: string };
};

type Project = {
  id: string;
  name: string;
  isActive?: boolean;
  client: { id: string; name: string };
};

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    PageComponent,
    DashboardWidgetComponent,
    DashboardTimeTodayWidgetComponent,
    DashboardPipelineWidgetComponent,
    DashboardInvoicesWidgetComponent,
    DashboardProjectsWidgetComponent,
    DragDropModule,
  ],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  private timerInterval: ReturnType<typeof setInterval> | null = null;
  protected readonly tick = signal(0);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly clientsCount = signal(0);
  readonly projectsCount = signal(0);
  readonly openLeadsCount = signal(0);
  readonly weekHoursLabel = signal('0:00');

  readonly timeEntries = signal<TimeEntry[]>([]);
  readonly leads = signal<Lead[]>([]);
  readonly invoices = signal<Invoice[]>([]);
  readonly projects = signal<Project[]>([]);

  readonly timeLoading = signal(true);
  readonly pipelineLoading = signal(true);
  readonly invoicesLoading = signal(true);
  readonly projectsLoading = signal(true);

  readonly timeError = signal<string | null>(null);
  readonly pipelineError = signal<string | null>(null);
  readonly invoicesError = signal<string | null>(null);
  readonly projectsError = signal<string | null>(null);

  private readonly savedOrder = signal<string[]>([]);

  readonly orderedWidgets = computed(() => {
    const saved = this.savedOrder();
    if (saved.length === 0) return WIDGET_CONFIGS;
    const orderMap = new Map(saved.map((id, i) => [id, i]));
    const maxOrder = WIDGET_CONFIGS.length;
    return [...WIDGET_CONFIGS].sort((a, b) => {
      const aOrder = orderMap.has(a.id) ? orderMap.get(a.id)! : maxOrder;
      const bOrder = orderMap.has(b.id) ? orderMap.get(b.id)! : maxOrder;
      return aOrder - bOrder;
    });
  });

  readonly droppableScope = DROPPABLE_SCOPE;

  ngOnInit() {
    this.loadSavedOrder();
    this.timerInterval = setInterval(() => this.tick.update((n) => n + 1), 1000);
    void this.loadAll();
  }

  ngOnDestroy() {
    if (this.timerInterval) clearInterval(this.timerInterval);
  }

  onWidgetDrop(event: DragEvent, targetWidgetId: string) {
    const draggedId = event.dataTransfer?.getData('text');
    if (!draggedId || draggedId === targetWidgetId) return;

    const ids = this.orderedWidgets().map((w) => w.id);
    const fromIdx = ids.indexOf(draggedId);
    const toIdx = ids.indexOf(targetWidgetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...ids];
    reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, draggedId);
    this.saveOrder(reordered);
  }

  private loadSavedOrder() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
          this.savedOrder.set(parsed);
        }
      }
    } catch {
      // ignore invalid stored data
    }
  }

  private saveOrder(order: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
      this.savedOrder.set(order);
    } catch {
      // ignore storage errors
    }
  }

  private async loadAll() {
    this.loading.set(true);
    this.error.set(null);

    await Promise.all([
      this.loadTimeEntries(),
      this.loadLeads(),
      this.loadInvoices(),
      this.loadProjects(),
      this.loadClients(),
    ]);

    this.loading.set(false);
  }

  private async loadClients() {
    try {
      const data = await this.api.get<{ id: string }[]>('/clients');
      this.clientsCount.set(data.length);
    } catch {
      // non-critical for dashboard shell
    }
  }

  private async loadProjects() {
    this.projectsLoading.set(true);
    this.projectsError.set(null);
    try {
      const data = await this.api.get<Project[]>('/projects');
      this.projects.set(data);
      this.projectsCount.set(data.filter((p) => p.isActive !== false).length);
    } catch (err) {
      this.projectsError.set(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      this.projectsLoading.set(false);
    }
  }

  private async loadLeads() {
    this.pipelineLoading.set(true);
    this.pipelineError.set(null);
    try {
      const data = await this.api.get<Lead[]>('/leads');
      this.leads.set(data);
      const openStages = new Set(['NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT', 'ON_HOLD']);
      this.openLeadsCount.set(data.filter((l) => openStages.has(l.stage)).length);
    } catch (err) {
      this.pipelineError.set(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally {
      this.pipelineLoading.set(false);
    }
  }

  private async loadInvoices() {
    this.invoicesLoading.set(true);
    this.invoicesError.set(null);
    try {
      const data = await this.api.get<Invoice[]>('/invoices');
      this.invoices.set(data);
    } catch (err) {
      this.invoicesError.set(err instanceof Error ? err.message : 'Failed to load invoices');
    } finally {
      this.invoicesLoading.set(false);
    }
  }

  private async loadTimeEntries() {
    this.timeLoading.set(true);
    this.timeError.set(null);
    try {
      const weekStart = startOfWeek(new Date());
      const from = weekStart.toISOString();
      const to = endOfWeek(weekStart).toISOString();
      let data = await this.api.get<TimeEntry[]>(
        `/time-entries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      if (!data.some((e) => !e.stoppedAt)) {
        const all = await this.api.get<TimeEntry[]>('/time-entries');
        const active = all.find((e) => !e.stoppedAt);
        if (active && !data.some((e) => e.id === active.id)) {
          data = [active, ...data];
        }
      }
      this.timeEntries.set(data);
      this.weekHoursLabel.set(formatDurationMin(this.computeWeekMinutes(data)));
    } catch (err) {
      this.timeError.set(err instanceof Error ? err.message : 'Failed to load time entries');
    } finally {
      this.timeLoading.set(false);
    }
  }

  private computeWeekMinutes(entries: TimeEntry[]): number {
    const weekStart = startOfWeek(new Date());
    const weekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return dateKey(d);
      }),
    );
    const running = entries.find((e) => !e.stoppedAt);
    let total = 0;
    for (const e of entries) {
      const key = dateKey(new Date(e.startedAt));
      if (!weekKeys.has(key)) continue;
      if (!e.stoppedAt) {
        if (e.id === running?.id) {
          const ms = Date.now() - new Date(e.startedAt).getTime();
          total += Math.max(0, Math.round(ms / 60_000));
        }
      } else {
        total += e.durationMin ?? 0;
      }
    }
    return total;
  }
}
