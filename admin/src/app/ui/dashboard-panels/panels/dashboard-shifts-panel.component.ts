import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { RecordCardComponent } from '../../record-card/record-card.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-shifts-panel',
  standalone: true,
  imports: [RouterLink, ButtonModule, DashboardPanelComponent, RecordCardComponent],
  templateUrl: './dashboard-shifts-panel.component.html',
})
export class DashboardShiftsPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}