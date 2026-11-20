import { Component, inject } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DashboardPanelComponent } from '../../dashboard-panel/dashboard-panel.component';
import { RecordCardComponent } from '../../record-card/record-card.component';
import { dashboardPanelColor } from '../dashboard-panels.config';
import { DashboardStore } from '../dashboard-store.service';

@Component({
  selector: 'app-dashboard-visits-panel',
  standalone: true,
  imports: [ButtonModule, DashboardPanelComponent, RecordCardComponent],
  templateUrl: './dashboard-visits-panel.component.html',
})
export class DashboardVisitsPanelComponent {
  readonly store = inject(DashboardStore);
  readonly panelColor = dashboardPanelColor;
}