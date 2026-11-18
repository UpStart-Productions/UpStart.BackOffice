import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { RecordCardComponent } from '../../record-card/record-card.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-feed-panel',
  standalone: true,
  imports: [RouterLink, TagModule, TooltipModule, DashboardPanelComponent, EmptyStateComponent, RecordCardComponent],
  templateUrl: './dashboard-feed-panel.component.html',
})
export class DashboardFeedPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}