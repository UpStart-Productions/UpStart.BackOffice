import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-time-panel',
  standalone: true,
  imports: [RouterLink, ButtonModule, TooltipModule, DashboardPanelComponent, EmptyStateComponent],
  templateUrl: './dashboard-time-panel.component.html',
})
export class DashboardTimePanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}