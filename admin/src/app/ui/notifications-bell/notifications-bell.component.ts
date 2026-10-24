import { Component, output, ViewChild } from '@angular/core';
import { Popover, PopoverModule } from 'primeng/popover';

/** Top-bar notifications entry point; API wiring comes later. */
@Component({
  selector: 'app-notifications-bell',
  standalone: true,
  imports: [PopoverModule],
  template: `
    <button
      type="button"
      class="layout-topbar-action notifications-bell-btn"
      (click)="popover.toggle($event)"
      aria-label="Notifications"
      aria-haspopup="true"
    >
      <i class="pi pi-bell"></i>
    </button>
    <p-popover #popover appendTo="body" styleClass="notifications-panel" (onShow)="opened.emit()">
      <div class="notifications-panel-header">
        <h5 class="m-0">Notifications</h5>
      </div>
      <p class="p-3 text-color-secondary mb-0">No notifications yet.</p>
    </p-popover>
  `,
  styles: [
    `
      .notifications-bell-btn {
        position: relative;
      }
      .notifications-panel-header {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--surface-border);
      }
    `,
  ],
})
export class NotificationsBellComponent {
  readonly opened = output<void>();

  @ViewChild('popover') private popover?: Popover;

  closePanel(): void {
    this.popover?.hide();
  }
}
