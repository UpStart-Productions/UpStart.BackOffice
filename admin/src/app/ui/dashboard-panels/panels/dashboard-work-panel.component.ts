import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardRowComponent } from '../dashboard-row.component';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-work-panel',
  standalone: true,
  imports: [RouterLink, DashboardPanelComponent, EmptyStateComponent, DashboardRowComponent],
  templateUrl: './dashboard-work-panel.component.html',
})
export class DashboardWorkPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}