import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TooltipModule } from 'primeng/tooltip';
import { PageComponent } from '../../ui/layout/page.component';
import {
  DashboardFeedPanelComponent,
  DashboardJdPanelComponent,
  DashboardMoneyPanelComponent,
  DashboardPipelinePanelComponent,
  DashboardShiftsPanelComponent,
  DashboardStore,
  DashboardTimePanelComponent,
  DashboardTodayPanelComponent,
  DashboardWorkPanelComponent,
} from '../../ui/dashboard-panels';
import type { Panel } from '../../ui/dashboard-panels/dashboard.types';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  providers: [DashboardStore],
  imports: [
    FormsModule,
    RouterLink,
    CdkDrag,
    CdkDropList,
    ButtonModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    AppDialogModule,
    TooltipModule,
    PageComponent,
    DashboardMoneyPanelComponent,
    DashboardTodayPanelComponent,
    DashboardWorkPanelComponent,
    DashboardPipelinePanelComponent,
    DashboardJdPanelComponent,
    DashboardFeedPanelComponent,
    DashboardTimePanelComponent,
    DashboardShiftsPanelComponent,
  ],
  templateUrl: './dashboard.page.html',
})
export class DashboardPage implements OnInit, OnDestroy {
  readonly store = inject(DashboardStore);

  ngOnInit(): void {
    this.store.ngOnInit();
  }

  ngOnDestroy(): void {
    this.store.ngOnDestroy();
  }

  onPanelDrop(event: CdkDragDrop<Panel[]>): void {
    this.store.onPanelDrop(event);
  }
}