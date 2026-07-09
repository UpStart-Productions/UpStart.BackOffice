import { Component, input } from '@angular/core';

@Component({
  selector: 'app-dashboard-widget-content',
  standalone: true,
  template: `
    @if (loading()) {
      <p class="text-muted mb-0">Loading…</p>
    } @else if (error()) {
      <p class="mb-0" role="alert">{{ error() }}</p>
    } @else if (empty()) {
      @if (emptyMessage()) {
        <p class="text-muted mb-0">{{ emptyMessage() }}</p>
      }
      <ng-content select="[dashboardWidgetEmptyAction]" />
    } @else {
      <ng-content />
    }
  `,
  host: {
    class: 'dashboard-widget-content',
  },
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-height: 0;
      }
    `,
  ],
})
export class DashboardWidgetContentComponent {
  loading = input(false);
  error = input<string | null>(null);
  empty = input(false);
  emptyMessage = input<string | undefined>(undefined);
}
