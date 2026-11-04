import { Component, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

export type RowActionSeverity = 'danger' | 'warn';

export interface RowActionButtonItem {
  id: string;
  label: string;
  icon: string;
  command: (event?: Event) => void;
  disabled?: boolean;
  severity?: RowActionSeverity;
}

/** Inline control in the popover (icon + select, same row shape as button items). */
export interface RowActionSelectItem {
  id: string;
  kind: 'select';
  icon: string;
  /** Screen readers and the select's aria-label. */
  ariaLabel: string;
  options: { label: string; value: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export type RowActionItem = RowActionButtonItem | RowActionSelectItem;

export function isRowActionSelect(item: RowActionItem): item is RowActionSelectItem {
  return 'kind' in item && item.kind === 'select';
}

@Component({
  selector: 'app-row-actions-menu',
  standalone: true,
  imports: [AppPopoverModule, ButtonModule, FormsModule, SelectModule],
  template: `
    <div class="row-actions-wrap">
      <button
        type="button"
        class="row-actions-trigger p-button p-button-text p-button-rounded p-button-plain"
        (click)="popover.toggle($event, $event.currentTarget)"
        [attr.aria-label]="ariaLabel()"
        aria-haspopup="true"
      >
        <i class="pi pi-ellipsis-v"></i>
      </button>
      <p-popover
        #popover
        appendTo="body"
        appCenterPopoverCaret
        styleClass="row-actions-popover"
        [dismissable]="true"
        (onHide)="onPopoverHide()"
      >
        <div class="row-actions-list">
          @for (item of items(); track item.id) {
            @if (isRowActionSelect(item)) {
              <div class="row-actions-item row-actions-select-row" (click)="$event.stopPropagation()">
                <i class="row-actions-item-icon {{ item.icon }}" aria-hidden="true"></i>
                <p-select
                  [options]="item.options"
                  optionLabel="label"
                  optionValue="value"
                  [ngModel]="item.value"
                  (ngModelChange)="onSelectChange(item, $event)"
                  [disabled]="item.disabled"
                  styleClass="w-full row-actions-select-control"
                  appendTo="body"
                  [attr.aria-label]="item.ariaLabel"
                />
              </div>
            } @else {
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
      .row-actions-select-row {
        cursor: default;
        min-width: 12rem;
      }
      .row-actions-select-row:hover {
        background: var(--p-content-hover-background, rgba(0, 0, 0, 0.04));
      }
      .row-actions-select-row .row-actions-select-control {
        flex: 1;
        min-width: 0;
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

  protected readonly isRowActionSelect = isRowActionSelect;

  protected onSelectChange(item: RowActionSelectItem, value: string) {
    if (item.disabled || value === item.value) return;
    item.onChange(value);
    this.action.emit(item.id);
  }

  protected onActionClick(event: Event, item: RowActionButtonItem): void {
    if (item.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    this.popoverRef()?.hide();
    item.command(event);
    this.action.emit(item.id);
  }

  protected onPopoverHide(): void {}
}
