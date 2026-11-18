import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardRowComponent } from '../dashboard-row.component';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-today-panel',
  standalone: true,
  imports: [RouterLink, ButtonModule, TooltipModule, LucideIconComponent, DashboardPanelComponent, EmptyStateComponent, DashboardRowComponent],
  templateUrl: './dashboard-today-panel.component.html',
})
export class DashboardTodayPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}