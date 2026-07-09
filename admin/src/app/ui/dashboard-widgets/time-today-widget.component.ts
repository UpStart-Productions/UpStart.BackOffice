import { Component, computed, input } from '@angular/core';
import { DashboardWidgetContentComponent } from '../dashboard-widget/dashboard-widget-content.component';
import type { TimeEntry } from '../../pages/time-entry/time-entry.types';
import {
  dateKey,
  formatDurationMin,
  formatElapsed,
  startOfWeek,
} from '../../pages/time-entry/timesheet.utils';

@Component({
  selector: 'app-dashboard-time-today-widget',
  standalone: true,
  imports: [DashboardWidgetContentComponent],
  template: `
    <app-dashboard-widget-content
      [loading]="loading()"
      [error]="error()"
    >
      @if (runningEntry(); as running) {
        <div class="time-running-banner">
          <div class="time-running-label">
            <i class="pi pi-clock" aria-hidden="true"></i>
            Timer running
          </div>
          <div class="time-running-project">
            {{ running.project.name }}
            <span class="text-muted">({{ running.project.client.name }})</span>
          </div>
          <div class="time-running-elapsed">{{ elapsedLabel() }}</div>
        </div>
      }

      <div class="time-stats">
        <div class="time-stat">
          <span class="time-stat-label">Today</span>
          <span class="time-stat-value">{{ formatMin(todayMin()) }}</span>
        </div>
        <div class="time-stat">
          <span class="time-stat-label">This week</span>
          <span class="time-stat-value">{{ formatMin(weekMin()) }}</span>
        </div>
      </div>

      @if (todayEntries().length > 0) {
        <ul class="dashboard-list">
          @for (entry of todayEntries(); track entry.id) {
            <li class="dashboard-list-item">
              <div class="dashboard-list-main">
                <span class="dashboard-list-title">{{ entry.project.name }}</span>
                <span class="text-muted">{{ entry.project.client.name }}</span>
              </div>
              <span class="dashboard-list-meta">{{ entryDuration(entry) }}</span>
            </li>
          }
        </ul>
      } @else if (!runningEntry()) {
        <p class="text-muted mb-0">No time tracked today yet.</p>
      }
    </app-dashboard-widget-content>
  `,
  styles: [
    `
      .time-running-banner {
        padding: 0.875rem 1rem;
        margin-bottom: 1rem;
        border-radius: var(--content-border-radius);
        background: #f5f3ff;
        border-left: 3px solid var(--brand-primary);
      }

      .time-running-label {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--brand-primary);
        margin-bottom: 0.25rem;
      }

      .time-running-project {
        font-weight: 600;
        font-size: 0.9375rem;
        margin-bottom: 0.25rem;
      }

      .time-running-elapsed {
        font-size: 1.375rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--brand-primary);
      }

      .time-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
        margin-bottom: 1rem;
      }

      .time-stat {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--content-border-radius);
      }

      .time-stat-label {
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--color-text-muted);
      }

      .time-stat-value {
        font-size: 1.25rem;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class DashboardTimeTodayWidgetComponent {
  entries = input<TimeEntry[]>([]);
  loading = input(false);
  error = input<string | null>(null);
  tick = input(0);

  readonly todayKey = dateKey(new Date());

  readonly runningEntry = computed(() => {
    this.tick();
    return this.entries().find((e) => !e.stoppedAt) ?? null;
  });

  readonly todayEntries = computed(() => {
    const running = this.runningEntry();
    return this.entries()
      .filter((e) => dateKey(new Date(e.startedAt)) === this.todayKey)
      .filter((e) => e.stoppedAt || e.id === running?.id)
      .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime())
      .slice(0, 5);
  });

  readonly todayMin = computed(() => this.sumMinutesForDay(this.todayKey));
  readonly weekMin = computed(() => {
    const weekStart = startOfWeek(new Date());
    const weekKeys = new Set(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return dateKey(d);
      }),
    );
    let total = 0;
    for (const e of this.entries()) {
      const key = dateKey(new Date(e.startedAt));
      if (!weekKeys.has(key)) continue;
      total += this.entryMinutes(e);
    }
    return total;
  });

  readonly elapsedLabel = computed(() => {
    this.tick();
    const running = this.runningEntry();
    if (!running) return '0:00:00';
    const ms = Date.now() - new Date(running.startedAt).getTime();
    return formatElapsed(ms);
  });

  formatMin(min: number): string {
    return formatDurationMin(min);
  }

  entryDuration(entry: TimeEntry): string {
    return formatDurationMin(this.entryMinutes(entry));
  }

  private sumMinutesForDay(key: string): number {
    let total = 0;
    for (const e of this.entries()) {
      if (dateKey(new Date(e.startedAt)) !== key) continue;
      total += this.entryMinutes(e);
    }
    return total;
  }

  private entryMinutes(entry: TimeEntry): number {
    if (!entry.stoppedAt) {
      this.tick();
      const ms = Date.now() - new Date(entry.startedAt).getTime();
      return Math.max(0, Math.round(ms / 60_000));
    }
    return entry.durationMin ?? 0;
  }
}
