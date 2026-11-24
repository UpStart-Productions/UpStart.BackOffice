import { Component, input } from '@angular/core';
import { SortAltIcon } from 'primeng/icons/sortalt';
import { SortAmountDownIcon } from 'primeng/icons/sortamountdown';
import { SortAmountUpAltIcon } from 'primeng/icons/sortamountupalt';

/** Same SVG sort glyphs as `p-sortIcon` on tables (`order`: 0 inactive, 1 asc, -1 desc). */
@Component({
  selector: 'app-tm-grid-sort-icon',
  standalone: true,
  imports: [SortAltIcon, SortAmountUpAltIcon, SortAmountDownIcon],
  template: `
    @if (order() === 0) {
      <svg data-p-icon="sort-alt" class="p-sortable-column-icon p-datatable-sort-icon"></svg>
    } @else if (order() === 1) {
      <svg data-p-icon="sort-amount-up-alt" class="p-sortable-column-icon p-datatable-sort-icon"></svg>
    } @else {
      <svg data-p-icon="sort-amount-down" class="p-sortable-column-icon p-datatable-sort-icon"></svg>
    }
  `,
})
export class TmGridSortIconComponent {
  order = input.required<0 | 1 | -1>();
}