import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { RecordCardComponent } from '../record-card/record-card.component';
import type { DashRow } from './dashboard.types';

@Component({
  selector: 'app-dashboard-row',
  standalone: true,
  imports: [RecordCardComponent, TagModule, ButtonModule, RouterLink, TooltipModule],
  template: `
    <app-record-card
      variant="compact"
      [singleLine]="true"
      [title]="row().title"
      [subtitle]="row().subtitle ?? null"
      [link]="row().open ? null : (row().link ?? null)"
      [clickable]="!!row().open"
      (titleClick)="row().open?.()"
      [linkQuery]="row().query ?? null"
      [icon]="row().person ? null : (row().icon ?? 'circle')"
      [tone]="row().tone ?? null"
      [person]="row().person ?? null"
    >
      <ng-container ngProjectAs="[recordActions]">
        @if (row().isNew) {
          <p-tag value="New" severity="info" pTooltip="New since your last visit" tooltipPosition="top" tooltipStyleClass="ubo-dark-tooltip" [showDelay]="tipDelay()" appendTo="body" />
        }
        @if (row().badge) {
          <p-tag [value]="row().badge!.label" [severity]="row().badge!.severity" [pTooltip]="row().badge!.hint ?? ''" tooltipPosition="top" tooltipStyleClass="ubo-dark-tooltip" [showDelay]="tipDelay()" appendTo="body" />
        }
        @if (row().action) {
          <a
            pButton
            [label]="row().action!.label"
            size="small"
            [severity]="row().action!.primary ? 'primary' : 'secondary'"
            [outlined]="!row().action!.primary"
            [routerLink]="row().action!.link"
            [queryParams]="row().action!.query ?? null"
          ></a>
        }
        @if (row().done) {
          <p-button
            icon="pi pi-check-circle"
            size="small"
            severity="secondary"
            [text]="true"
            styleClass="icon-action-btn"
            [ariaLabel]="'Mark done: ' + row().title"
            pTooltip="Mark done"
            tooltipPosition="left"
            tooltipStyleClass="ubo-dark-tooltip"
            [showDelay]="tipDelay()"
            appendTo="body"
            [loading]="busyRow() === row().key"
            (onClick)="done.emit(row())"
          />
        }
      </ng-container>
    </app-record-card>
  `,
})
export class DashboardRowComponent {
  readonly row = input.required<DashRow>();
  readonly busyRow = input<string | null>(null);
  readonly tipDelay = input(0);
  readonly done = output<DashRow>();
}