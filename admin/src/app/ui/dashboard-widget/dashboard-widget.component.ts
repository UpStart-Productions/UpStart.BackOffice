import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type DashboardWidgetSpan = 1 | 2 | 3;
export type DashboardWidgetHeight = 'short' | 'tall';

export type DashboardWidgetIconColor =
  | 'primary'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger';

@Component({
  selector: 'app-dashboard-widget',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div
      class="card dashboard-widget-card"
      [style.grid-column]="'span ' + span()"
      [style.grid-row]="height() === 'tall' ? 'span 2' : null"
    >
      @if (!hideHeader() || showDragHandle()) {
        <div class="dashboard-widget-header-row">
          <div class="dashboard-widget-header-left">
            @if (!hideHeader()) {
              @if (icon()) {
                <span
                  class="dashboard-widget-header-icon"
                  [style.color]="'var(--color-severity-' + (iconColor() ?? 'info') + '-text)'"
                >
                  <i [class]="'pi ' + icon()"></i>
                </span>
              }
              <h5 class="dashboard-widget-title">{{ title() }}</h5>
              @if (seeAllLink()) {
                <a
                  [routerLink]="seeAllLink()"
                  class="dashboard-widget-see-all"
                  [attr.aria-label]="seeAllAriaLabel() ?? 'See all'"
                >
                  <i class="pi pi-arrow-right" aria-hidden="true"></i>
                </a>
              }
            }
          </div>
          <div class="dashboard-widget-header-actions">
            @if (headerRight()) {
              <span class="dashboard-widget-header-meta text-muted">{{ headerRight() }}</span>
            }
            @if (showDragHandle()) {
              <div class="dashboard-widget-drag-handle" aria-hidden="true">
                <i class="pi pi-ellipsis-h"></i>
              </div>
            }
          </div>
        </div>
      }
      <div class="dashboard-widget-body">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .dashboard-widget-card {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
        margin-bottom: 0;
      }

      .dashboard-widget-header-row {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        gap: 1rem;
        margin: -2rem -2rem 1rem -2rem;
        padding: 0.5rem 2rem;
        border-bottom: 1px solid var(--color-border);
      }

      .dashboard-widget-header-left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
        flex-shrink: 0;
      }

      .dashboard-widget-header-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        line-height: 1;
      }

      .dashboard-widget-header-icon i {
        font-size: 1.125rem;
      }

      .dashboard-widget-title {
        margin: 0;
        font-size: 1rem;
        line-height: 1.25;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-widget-see-all {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 1.75rem;
        height: 1.75rem;
        color: var(--color-text-muted);
        text-decoration: none;
        border-radius: var(--content-border-radius);
        transition: color 0.15s ease;
      }

      .dashboard-widget-see-all:hover {
        color: var(--brand-primary);
      }

      .dashboard-widget-see-all i {
        font-size: 0.875rem;
      }

      .dashboard-widget-header-actions {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 0.75rem;
        flex-shrink: 0;
        margin-left: auto;
      }

      .dashboard-widget-header-meta {
        font-size: 0.875rem;
      }

      .dashboard-widget-drag-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        color: var(--color-text-muted);
        cursor: grab;
        border-radius: var(--content-border-radius);
      }

      .dashboard-widget-drag-handle:active {
        cursor: grabbing;
      }

      .dashboard-widget-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }

      .dashboard-widget-body::-webkit-scrollbar {
        display: none;
      }

      @media (max-width: 991px) {
        .dashboard-widget-card {
          grid-column: span 1 !important;
          grid-row: span 1 !important;
        }
      }
    `,
  ],
})
export class DashboardWidgetComponent {
  title = input.required<string>();
  icon = input<string | undefined>(undefined);
  iconColor = input<DashboardWidgetIconColor | undefined>(undefined);
  span = input<DashboardWidgetSpan>(1);
  height = input<DashboardWidgetHeight>('short');
  hideHeader = input<boolean>(false);
  showDragHandle = input<boolean>(false);
  headerRight = input<string | undefined>(undefined);
  seeAllLink = input<string | undefined>(undefined);
  seeAllAriaLabel = input<string | undefined>(undefined);
}
