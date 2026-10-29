import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/** Icon tile color. No purple: that is reserved for action buttons. */
export type DashboardPanelColor = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/**
 * A Dashboard panel: card with a header bar (colored icon tile, title that links to the full list, drag handle) and a body.
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
        <h3 class="dashboard-panel-title">
          @if (link(); as l) {
            <a class="dashboard-panel-title-link" [routerLink]="l" [queryParams]="queryParams()" [attr.title]="linkLabel()">{{ title() }}</a>
          } @else {
            {{ title() }}
          }
        </h3>
        <div class="dashboard-panel-actions">
          <button type="button" class="dashboard-panel-handle" cdkDragHandle aria-label="Drag to reorder" title="Drag to reorder">
            <i class="pi pi-ellipsis-h" aria-hidden="true"></i>
          </button>
        </div>
      </header>
      <div class="dashboard-panel-body">
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
      }

      .dashboard-panel {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        margin: 0;
        border: 1px solid var(--surface-border);
        transition: box-shadow 0.15s ease;
      }

      .dashboard-panel:hover {
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
      }

      /* Full-width header bar inside the card's 2rem padding. */
      .dashboard-panel-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin: -2rem -2rem 1.25rem;
        padding: 0.75rem 1rem 0.75rem 2rem;
        border-bottom: 1px solid var(--surface-border);
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

      .dashboard-panel-title-link {
        color: inherit;
        text-decoration: none;
      }

      .dashboard-panel-title-link:hover {
        color: var(--color-text-link);
      }

      .dashboard-panel-title-link:focus-visible {
        outline: 2px solid var(--color-text-link);
        outline-offset: 2px;
        border-radius: 2px;
      }

      .dashboard-panel-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        flex-shrink: 0;
      }

      .dashboard-panel-handle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--text-color-secondary);
        border-radius: var(--content-border-radius);
        cursor: grab;
      }

      .dashboard-panel-handle:hover {
        background: var(--p-content-hover-background, #f3f4f6);
      }

      .dashboard-panel-handle:active {
        cursor: grabbing;
      }

      .dashboard-panel-body {
        flex: 1 1 auto;
        min-height: 0;
      }
    `,
  ],
})
export class DashboardPanelComponent {
  title = input.required<string>();
  /** PrimeIcons name without the "pi " prefix, e.g. "pi-clock". */
  icon = input.required<string>();
  color = input<DashboardPanelColor>('neutral');
  link = input<string | unknown[] | null>(null);
  /** Tooltip on the title link, e.g. "Open in Tasks". */
  linkLabel = input('Open');
  queryParams = input<Params | null>(null);
}
