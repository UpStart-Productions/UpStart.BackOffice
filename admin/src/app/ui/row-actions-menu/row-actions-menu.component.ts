import { Component, input, output, viewChild } from '@angular/core';
import { Popover, PopoverModule } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';

export type RowActionSeverity = 'danger' | 'warn';

export interface RowActionItem {
  id: string;
  label: string;
  icon: string;
  command: (event?: Event) => void;
  disabled?: boolean;
  severity?: RowActionSeverity;
}

@Component({
  selector: 'app-row-actions-menu',
  standalone: true,
  imports: [PopoverModule, ButtonModule],
  template: `
    <div class="row-actions-wrap">
      <button
        type="button"
        class="row-actions-trigger p-button p-button-text p-button-rounded p-button-plain"
        (click)="popover.toggle($event)"
        [attr.aria-label]="ariaLabel()"
        aria-haspopup="true"
      >
        <i class="pi pi-ellipsis-v"></i>
      </button>
      <p-popover
        #popover
        appendTo="body"
        styleClass="row-actions-popover"
        [dismissable]="true"
        (onHide)="onPopoverHide()"
      >
        <div class="row-actions-list">
          @for (item of items(); track item.id) {
            <button
              type="button"
              class="row-actions-item"
              [class.row-actions-item-danger]="item.severity === 'danger'"
              [class.row-actions-item-warn]="item.severity === 'warn'"
              [disabled]="item.disabled"
              (click)="onActionClick($event, item)"
            >
              <i class="row-actions-item-icon {{ item.icon }}"></i>
              <span class="row-actions-item-label">{{ item.label }}</span>
            </button>
          }
        </div>
      </p-popover>
    </div>
  `,
  styles: [
    `
      .row-actions-wrap {
        display: inline-flex;
      }
      .row-actions-trigger {
        min-width: auto !important;
        padding: 0.25rem 0.5rem !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }
      .row-actions-trigger:hover {
        background: var(--p-button-text-hover-background, rgba(0, 0, 0, 0.04)) !important;
      }
      .row-actions-list {
        display: flex;
        flex-direction: column;
        min-width: 10rem;
      }
      .row-actions-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: none;
        background: transparent;
        text-align: left;
        cursor: pointer;
        font: inherit;
        color: inherit;
        transition: background-color 0.2s;
        border-radius: var(--p-content-border-radius, 0.25rem);
      }
      .row-actions-item:hover:not(:disabled) {
        background: var(--p-content-hover-background, rgba(0, 0, 0, 0.04));
      }
      .row-actions-item:disabled {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .row-actions-item-icon {
        flex-shrink: 0;
      }
      .row-actions-item-label {
        flex: 1;
      }
      .row-actions-item-danger,
      .row-actions-item-danger .row-actions-item-icon,
      .row-actions-item-danger .row-actions-item-label {
        color: var(--p-button-text-danger-color, var(--p-tag-danger-color, #dc3545));
      }
      .row-actions-item-warn,
      .row-actions-item-warn .row-actions-item-icon,
      .row-actions-item-warn .row-actions-item-label {
        color: var(--p-button-text-warn-color, var(--p-tag-warn-color, #f59e0b));
      }
    `,
  ],
})
export class RowActionsMenuComponent {
  items = input.required<RowActionItem[]>();
  action = output<string>();
  ariaLabel = input<string>('Row actions');

  private popoverRef = viewChild<Popover>('popover');

  protected onActionClick(event: Event, item: RowActionItem): void {
    if (item.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    this.popoverRef()?.hide();
    item.command(event);
    this.action.emit(item.id);
  }

  protected onPopoverHide(): void {}
}
