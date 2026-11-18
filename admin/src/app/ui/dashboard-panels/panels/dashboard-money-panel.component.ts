import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';
import { ReportChartComponent } from '../../charts/report-chart.component';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { EmptyStateComponent } from '../../empty-state/empty-state.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardRowComponent } from '../dashboard-row.component';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-money-panel',
  standalone: true,
  imports: [FormsModule, SelectModule, TooltipModule, DashboardPanelComponent, ReportChartComponent, EmptyStateComponent, DashboardRowComponent],
  templateUrl: './dashboard-money-panel.component.html',
})
export class DashboardMoneyPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}