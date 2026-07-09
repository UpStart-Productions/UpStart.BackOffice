import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardWidgetContentComponent } from '../dashboard-widget/dashboard-widget-content.component';
import { STAGES, type Lead } from '../../pages/pipeline/pipeline-board.page';

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
        font-size: 0.875rem;
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
  loading = input(false);
  error = input<string | null>(null);

  readonly stageCounts = computed(() =>
    STAGES.map((stage) => ({
      key: stage.key,
      label: stage.label,
      count: this.leads().filter((l) => l.stage === stage.key).length,
    })).filter((row) => row.count > 0 || ['NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT'].includes(row.key)),
  );

  readonly upcomingActions = computed(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const openStages = new Set(['NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT', 'ON_HOLD']);
    return this.leads()
      .filter((l) => openStages.has(l.stage) && l.nextActionDate)
      .sort(
        (a, b) =>
          new Date(a.nextActionDate!).getTime() - new Date(b.nextActionDate!).getTime(),
      )
      .slice(0, 6);
  });

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}
