import { Component, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { Popover, PopoverModule } from 'primeng/popover';
import { SelectModule } from 'primeng/select';
import { Recurrence, RecurrenceFreq } from '../core/tm.types';

/** Popover editor for a task's repeat rule. Emits the new rule or null. */
@Component({
  selector: 'app-tm-recurrence-editor',
  standalone: true,
  imports: [FormsModule, PopoverModule, SelectModule, InputNumberModule, ButtonModule],
  template: `
    <p-popover #pop appendTo="body" styleClass="tm-popover">
      <div class="tm-recurrence">
        <div class="tm-recurrence-row">
          <label for="tm-rec-freq">Repeat</label>
          <p-select
            inputId="tm-rec-freq"
            [options]="freqOptions"
            optionLabel="label"
            optionValue="value"
            [(ngModel)]="freq"
            appendTo="body"
            styleClass="w-full"
          />
        </div>
        @if (freq !== 'NONE') {
          <div class="tm-recurrence-row">
            <label for="tm-rec-interval">Every</label>
            <div class="flex align-items-center gap-2">
              <p-inputNumber inputId="tm-rec-interval" [(ngModel)]="interval" [min]="1" [max]="365" [showButtons]="false" inputStyleClass="tm-rec-interval" />
              <span>{{ unitLabel() }}</span>
            </div>
          </div>
          @if (freq === 'WEEKLY') {
            <div class="tm-recurrence-row">
              <span class="tm-recurrence-label">On</span>
              <div class="tm-weekday-toggle">
                @for (d of weekdayNames; track $index) {
                  <button type="button" [class.selected]="weekdays.includes($index)" (click)="toggleDay($index)" [attr.aria-pressed]="weekdays.includes($index)">{{ d }}</button>
                }
              </div>
            </div>
          }
          <div class="tm-recurrence-row">
            <label for="tm-rec-mode">Next due</label>
            <p-select
              inputId="tm-rec-mode"
              [options]="modeOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="mode"
              appendTo="body"
              styleClass="w-full"
            />
          </div>
        }
        <div class="flex justify-content-end gap-2 mt-2">
          <p-button label="Cancel" [text]="true" severity="secondary" size="small" (onClick)="pop.hide()" />
          <p-button label="Save" size="small" (onClick)="save()" />
        </div>
      </div>
    </p-popover>
  `,
})
export class TmRecurrenceEditorComponent {
  saved = output<Recurrence | null>();
  private readonly pop = viewChild.required<Popover>('pop');

  readonly freqOptions = [
    { label: 'Does not repeat', value: 'NONE' },
    { label: 'Daily', value: 'DAILY' },
    { label: 'Weekly', value: 'WEEKLY' },
    { label: 'Monthly', value: 'MONTHLY' },
    { label: 'Yearly', value: 'YEARLY' },
  ];
  readonly modeOptions = [
    { label: 'After the task is completed', value: 'ON_COMPLETE' },
    { label: 'On a fixed schedule (from due date)', value: 'ON_SCHEDULE' },
  ];
  readonly weekdayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  freq: RecurrenceFreq | 'NONE' = 'NONE';
  interval = 1;
  weekdays: number[] = [];
  mode: Recurrence['mode'] = 'ON_SCHEDULE';
  unitLabel(): string {
    const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year', NONE: '' }[this.freq];
    return this.interval === 1 ? unit : `${unit}s`;
  }

  open(event: Event, current: Recurrence | null) {
    this.freq = current?.freq ?? 'NONE';
    this.interval = current?.interval ?? 1;
    this.weekdays = [...(current?.weekdays ?? [])];
    this.mode = current?.mode ?? 'ON_SCHEDULE';
    this.pop().show(event, event.currentTarget ?? event.target);
  }

  toggleDay(d: number) {
    this.weekdays = this.weekdays.includes(d) ? this.weekdays.filter((x) => x !== d) : [...this.weekdays, d].sort();
  }

  save() {
    if (this.freq === 'NONE') {
      this.saved.emit(null);
    } else {
      this.saved.emit({
        freq: this.freq,
        interval: Math.max(1, Math.round(this.interval || 1)),
        mode: this.mode,
        ...(this.freq === 'WEEKLY' && this.weekdays.length ? { weekdays: this.weekdays } : {}),
      });
    }
    this.pop().hide();
  }
}
