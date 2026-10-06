import { Component, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';
import { dateKey, parseDateKey } from '../../core/date.util';
import { addDaysKey, todayKey } from '../core/tm-format.util';

/** Popover calendar with quick picks. Emits YYYY-MM-DD or null (clear). */
@Component({
  selector: 'app-tm-due-date-picker',
  standalone: true,
  imports: [FormsModule, PopoverModule, DatePickerModule],
  template: `
    <p-popover #pop appendTo="body" styleClass="tm-popover">
      <div class="tm-date-picker">
        <div class="tm-date-quick">
          <button type="button" (click)="pick(today())">Today</button>
          <button type="button" (click)="pick(addDays(1))">Tomorrow</button>
          <button type="button" (click)="pick(nextMonday())">Next week</button>
          @if (value()) {
            <button type="button" class="tm-date-clear" (click)="pick(null)">Clear</button>
          }
        </div>
        <p-datepicker [inline]="true" [ngModel]="value()" (ngModelChange)="onDate($event)" />
      </div>
    </p-popover>
  `,
})
export class TmDueDatePickerComponent {
  picked = output<string | null>();
  private readonly pop = viewChild.required<Popover>('pop');
  value = signal<Date | null>(null);

  open(event: Event, current: string | null) {
    this.value.set(current ? parseDateKey(current) : null);
    this.pop().show(event, event.currentTarget ?? event.target);
  }

  today() {
    return todayKey();
  }
  addDays(n: number) {
    return addDaysKey(todayKey(), n);
  }
  nextMonday() {
    const d = new Date();
    const add = ((8 - d.getDay()) % 7) || 7;
    return addDaysKey(todayKey(), add);
  }

  onDate(d: Date | null) {
    this.pick(d ? dateKey(d) : null);
  }

  pick(key: string | null) {
    this.picked.emit(key);
    this.pop().hide();
  }
}
