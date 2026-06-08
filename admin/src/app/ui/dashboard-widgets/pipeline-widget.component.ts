import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { STAGES, type Lead } from '../../pages/pipeline/pipeline-board.page';

@Component({
  selector: 'app-dashboard-pipeline-widget',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  template: `
    @if (loading()) {
      <p class="text-muted mb-0">Loading…</p>
    } @else if (error()) {
      <p class="mb-0" role="alert">{{ error() }}</p>
    } @else {
      <div class="stage-summary">
        @for (row of stageCounts(); track row.key) {
          <div class="stage-row">
            <span class="stage-label">{{ row.label }}</span>
            <span class="stage-count">{{ row.count }}</span>
          </div>
        }
      </div>

      @if (upcomingActions().length > 0) {
        <h6 class="section-heading">Upcoming actions</h6>
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

      <div class="widget-footer">
        <a pButton label="Open pipeline" icon="pi pi-arrow-right" iconPos="right" routerLink="/pipeline"></a>
      </div>
    }
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

      .section-heading {
        margin: 0 0 0.625rem;
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--color-text-muted);
      }

      .dashboard-list {
        list-style: none;
        margin: 0 0 1rem;
        padding: 0;
      }

      .dashboard-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--color-border);
      }

      .dashboard-list-item:last-child {
        border-bottom: none;
      }

      .dashboard-list-link {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }

      .dashboard-list-link:hover .dashboard-list-title {
        color: var(--brand-primary);
      }

      .dashboard-list-title {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .dashboard-list-meta {
        font-size: 0.8125rem;
        color: var(--color-text-muted);
        flex-shrink: 0;
      }

      .widget-footer {
        margin-top: auto;
        padding-top: 0.5rem;
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
