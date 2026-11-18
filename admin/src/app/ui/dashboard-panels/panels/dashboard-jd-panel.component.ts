import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-jd-panel',
  standalone: true,
  imports: [ButtonModule, TooltipModule, DashboardPanelComponent, EmptyStateComponent],
  templateUrl: './dashboard-jd-panel.component.html',
})
export class DashboardJdPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}