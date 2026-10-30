import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, input, model } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/** Icon tile color. No purple: that is reserved for action buttons. */
export type DashboardPanelColor = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** One tab in a panel's tab strip. Count uses the shared `.count-badge`. */
export type DashboardPanelTab = {
  id: string;
  label: string;
  count?: number;
  /** Badge color when the count is above zero. Zero uses the muted badge. */
  countTone?: 'info' | 'success' | 'warning' | 'danger';
};

/**
 * A Dashboard panel: card with a header bar (colored icon tile, title, drag handle), an optional tab strip,
 * a body that scrolls once it is about six rows tall, and an arrow in the header to the full list.
 * Place it inside a `cdkDrag` slot; the ⋯ handle is the drag handle. Rows in the body use `.side-list`.
 */
@Component({
  selector: 'app-dashboard-panel',
  standalone: true,
  imports: [CdkDragHandle, RouterLink],
  template: `
    <section class="card dashboard-panel" [attr.aria-label]="title()">
      <header class="dashboard-panel-header">
        <span class="dashboard-panel-icon" [attr.data-color]="color()" aria-hidden="true">
          <i [class]="'pi ' + icon()"></i>
        </span>
        <h3 class="dashboard-panel-title">{{ title() }}</h3>
        <button type="button" class="dashboard-panel-handle" cdkDragHandle aria-label="Drag to reorder" title="Drag to reorder">
          <i class="pi pi-ellipsis-h" aria-hidden="true"></i>
        </button>
        @if (link(); as l) {
          <a
            class="dashboard-panel-open"
            [routerLink]="l"
            [queryParams]="queryParams()"
            [attr.aria-label]="'Open ' + title()"
            [attr.title]="'Open ' + title()"
          >
            <i class="pi pi-arrow-right" aria-hidden="true"></i>
          </a>
        }
      </header>
      @if (tabs(); as tabList) {
        @if (tabList.length) {
          <div class="dashboard-panel-tabs" role="tablist" [attr.aria-label]="title()">
            @for (tab of tabList; track tab.id) {
              <button
                type="button"
                role="tab"
                class="dashboard-panel-tab"
                [class.dashboard-panel-tab--active]="activeTab() === tab.id"
                [attr.aria-selected]="activeTab() === tab.id"
                (click)="activeTab.set(tab.id)"
              >
                {{ tab.label }}
                @if (tab.count != null) {
                  <span [class]="countClass(tab)">{{ tab.count }}</span>
                }
              </button>
            }
          </div>
        }
      }
      <ng-content select=".dashboard-panel-pinned" />
      <div class="dashboard-panel-scroll">
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
      }

      .dashboard-panel.card {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        margin: 0;
        min-height: 0;
        padding: 2rem 0;
        border: 1px solid var(--surface-border);
        transition: box-shadow 0.15s ease;
      }

      .dashboard-panel.card:hover {
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
      }

      .dashboard-panel-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
        margin: -2rem 0 0;
        padding: 0.75rem 2rem;
      }

      .dashboard-panel-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 2rem;
        height: 2rem;
        border-radius: 0.5rem;
        background: var(--p-content-hover-background, #f3f4f6);
        color: var(--text-color-secondary);
      }

      .dashboard-panel-icon[data-color='info'] {
        background: var(--color-severity-info-bg);
        color: var(--color-severity-info-text);
      }

      .dashboard-panel-icon[data-color='success'] {
        background: var(--color-severity-success-bg);
        color: var(--color-severity-success-text);
      }

      .dashboard-panel-icon[data-color='warning'] {
        background: var(--color-severity-warning-bg);
        color: var(--color-severity-warning-text);
      }

      .dashboard-panel-icon[data-color='danger'] {
        background: var(--color-severity-danger-bg);
        color: var(--color-severity-danger-text);
      }

      .dashboard-panel-title {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        font-size: var(--fs-md);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-panel-handle {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--drag-handle-color);
        border-radius: var(--content-border-radius);
        cursor: grab;
      }

      .dashboard-panel-handle:hover {
        background: var(--p-content-hover-background, #f3f4f6);
      }

      .dashboard-panel-handle:active {
        cursor: grabbing;
      }

      .dashboard-panel-open {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: var(--content-border-radius);
        color: var(--text-color-secondary);
        text-decoration: none;
      }

      .dashboard-panel-open:hover {
        color: var(--text-color);
        background: var(--p-content-hover-background, #f3f4f6);
        text-decoration: none;
      }

      .dashboard-panel-open:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
      }

      .dashboard-panel-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.15rem 0.25rem;
        flex-shrink: 0;
        padding: 0 2rem;
      }

      .dashboard-panel-tab {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        padding: 0.55rem 0.7rem;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--text-color-secondary);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      .dashboard-panel-tab:hover {
        color: var(--text-color);
      }

      .dashboard-panel-tab--active {
        color: var(--text-color);
        border-bottom-color: var(--p-primary-color);
      }

      .dashboard-panel-tab:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: -2px;
      }

    `,
  ],
})
export class DashboardPanelComponent {
  title = input.required<string>();
  /** PrimeIcons name without the "pi " prefix, e.g. "pi-clock". */
  icon = input.required<string>();
  color = input<DashboardPanelColor>('neutral');
  /** Header arrow link to the full list. Omit for no arrow. */
  link = input<string | unknown[] | null>(null);
  queryParams = input<Params | null>(null);
  tabs = input<DashboardPanelTab[] | null>(null);
  activeTab = model('');

  countClass(tab: DashboardPanelTab): string {
    if (!tab.count) return 'count-badge count-badge--muted';
    return `count-badge count-badge--${tab.countTone ?? 'info'}`;
  }
}
