import { Component, computed, input } from '@angular/core';
import type { PipelineSummary } from '../../core/pipelines.api';
import { RouterLink } from '@angular/router';
import { DashboardWidgetContentComponent } from '../dashboard-widget/dashboard-widget-content.component';
import { type Lead } from '../../pages/pipeline/pipeline-board.page';

@Component({
  selector: 'app-dashboard-pipeline-widget',
  standalone: true,
  imports: [RouterLink, DashboardWidgetContentComponent],
  template: `
    <app-dashboard-widget-content
      [loading]="loading()"
      [error]="error()"
    >
      <div class="stage-summary">
        @for (row of stageCounts(); track row.key) {
          <div class="stage-row">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-count">{{ row.count }}</span>
          </div>
        }
      </div>

      @if (upcomingActions().length > 0) {
        <h6 class="widget-section-heading">Upcoming actions</h6>
        <ul class="dashboard-list">
          @for (lead of upcomingActions(); track lead.id) {
            <li class="dashboard-list-item">
              <a [routerLink]="['/pipeline', lead.id]" class="dashboard-list-link">
                <span class="dashboard-list-title">{{ lead.organization }}</span>
                @if (lead.nextAction) {
                  <span class="text-muted">{{ lead.nextAction }}</span>
                }
              </a>
              @if (lead.nextActionDate) {
                <span class="dashboard-list-meta">{{ formatDate(lead.nextActionDate) }}</span>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-muted mb-0">No upcoming actions scheduled.</p>
      }
    </app-dashboard-widget-content>
  `,
  styles: [
    `
      .stage-summary {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
        margin-bottom: 1.25rem;
      }

      .stage-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        padding: 0.375rem 0;
        border-bottom: 1px solid var(--color-border);
      }

      .stage-row:last-child {
        border-bottom: none;
      }

      .stage-label {
        font-size: var(--fs-sm);
      }

      .stage-count {
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        min-width: 1.5rem;
        text-align: right;
      }
    `,
  ],
})
export class DashboardPipelineWidgetComponent {
  leads = input<Lead[]>([]);
  /** Lanes come from the tenant's pipelines; the first pipeline is summarized. */
  pipelines = input<PipelineSummary[]>([]);
  loading = input(false);
  error = input<string | null>(null);

  readonly stageCounts = computed(() => {
    const pipeline = this.pipelines()[0];
    if (!pipeline) return [];
    return pipeline.stages
      .map((stage) => ({
        key: stage.id,
        label: stage.name,
        count: this.leads().filter((l) => l.stageId === stage.id).length,
      }))
      .filter((row, i) => row.count > 0 || i < 3);
  });

  /** Next steps across the board (archived cards are never loaded here). */
  readonly upcomingActions = computed(() =>
    this.leads()
      .filter((l) => l.nextActionDate)
      .sort((a, b) => new Date(a.nextActionDate!).getTime() - new Date(b.nextActionDate!).getTime())
      .slice(0, 6),
  );

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
