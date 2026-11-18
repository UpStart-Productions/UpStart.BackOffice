import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardRowComponent } from '../dashboard-row.component';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-pipeline-panel',
  standalone: true,
  imports: [RouterLink, TooltipModule, DashboardPanelComponent, EmptyStateComponent, DashboardRowComponent],
  templateUrl: './dashboard-pipeline-panel.component.html',
})
export class DashboardPipelinePanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}