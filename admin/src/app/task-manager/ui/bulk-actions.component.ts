import { Component, input, output } from '@angular/core';
import { TooltipModule } from 'primeng/tooltip';

/** Floating bar for bulk task actions (Asana-style). */
@Component({
  selector: 'app-tm-bulk-actions',
  standalone: true,
  imports: [TooltipModule],
  template: `
    <div class="tm-bulk-bar" role="toolbar" aria-label="Bulk task actions">
      <span class="tm-bulk-count">{{ count() }} task{{ count() === 1 ? '' : 's' }} selected</span>
      <div class="tm-bulk-actions">
        <button type="button" class="tm-bulk-btn" (click)="assign.emit($event)" pTooltip="Assign" tooltipPosition="top" aria-label="Assign">
          <i class="pi pi-user"></i>
        </button>
        <button type="button" class="tm-bulk-btn" (click)="dueDate.emit($event)" pTooltip="Due date" tooltipPosition="top" aria-label="Set due date">
          <i class="pi pi-calendar"></i>
        </button>
        <button type="button" class="tm-bulk-btn" (click)="move.emit($event)" pTooltip="Move to section" tooltipPosition="top" aria-label="Move to section">
          <i class="pi pi-arrow-right-arrow-left"></i>
        </button>
        <button type="button" class="tm-bulk-btn" (click)="complete.emit()" pTooltip="Mark complete" tooltipPosition="top" aria-label="Mark complete">
          <i class="pi pi-check-circle"></i>
        </button>
        <button type="button" class="tm-bulk-btn tm-bulk-btn--danger" (click)="delete.emit()" pTooltip="Delete tasks" tooltipPosition="top" aria-label="Delete tasks">
          <i class="pi pi-trash"></i>
        </button>
      </div>
      <button type="button" class="tm-bulk-btn tm-bulk-close" (click)="closed.emit()" aria-label="Clear selection">
        <i class="pi pi-times"></i>
      </button>
    </div>
  `,
})
export class TmBulkActionsComponent {
  count = input.required<number>();
  assign = output<Event>();
  dueDate = output<Event>();
  move = output<Event>();
  complete = output<void>();
  delete = output<void>();
  closed = output<void>();
}
