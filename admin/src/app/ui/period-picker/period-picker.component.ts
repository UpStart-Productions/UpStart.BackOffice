import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { DateInputComponent } from '../date-input/date-input.component';
import { PeriodValue, REPORT_MONTHS, REPORT_QUARTERS, ReportPeriodType } from '../../core/period.util';

/**
 * The one period control (RRY): Period (Month / Quarter / Custom range), then Year + Month, Year + Quarter, or From–To.
 * Renders its fields straight into the caller's flex row (host is display: contents), so callers put it beside other filters.
 * Bind with [(value)] to a PeriodValue signal; resolve dates with resolveReportPeriod from core/period.util.
 */
@Component({
  selector: 'app-period-picker',
  standalone: true,
  imports: [FormsModule, SelectModule, DateInputComponent],
  host: { style: 'display: contents' },
  template: `
    <div class="form-field period-field">
      <label [for]="idPrefix() + 'Type'">Period</label>
      <p-select
        [inputId]="idPrefix() + 'Type'"
        [options]="typeOptions"
        optionLabel="label"
        optionValue="value"
        [ngModel]="value().periodType"
        (ngModelChange)="patch({ periodType: $event })"
        styleClass="w-full"
        appendTo="body"
      />
    </div>
    @if (value().periodType !== 'custom') {
      <div class="form-field period-field">
        <label [for]="idPrefix() + 'Year'">Year</label>
        <p-select
          [inputId]="idPrefix() + 'Year'"
          [options]="yearOptions()"
          [ngModel]="value().year"
          (ngModelChange)="patch({ year: $event })"
          styleClass="w-full"
          appendTo="body"
        />
      </div>
    }
    @if (value().periodType === 'month') {
      <div class="form-field period-field">
        <label [for]="idPrefix() + 'Month'">Month</label>
        <p-select
          [inputId]="idPrefix() + 'Month'"
          [options]="months"
          optionLabel="label"
          optionValue="value"
          [ngModel]="value().month"
          (ngModelChange)="patch({ month: $event })"
          styleClass="w-full"
          appendTo="body"
        />
      </div>
    } @else if (value().periodType === 'quarter') {
      <div class="form-field period-field">
        <label [for]="idPrefix() + 'Quarter'">Quarter</label>
        <p-select
          [inputId]="idPrefix() + 'Quarter'"
          [options]="quarters"
          optionLabel="label"
          optionValue="value"
          [ngModel]="value().quarter"
          (ngModelChange)="patch({ quarter: $event })"
          styleClass="w-full"
          appendTo="body"
        />
      </div>
    } @else {
      <div class="form-field period-field period-field--range">
        <label [for]="idPrefix() + 'From'">Date range</label>
        <div class="period-range">
          <app-date-input
            [inputId]="idPrefix() + 'From'"
            [ngModel]="value().from"
            (ngModelChange)="patch({ from: $event })"
            ariaLabel="From date"
            placeholder="From"
          />
          <span class="text-color-secondary" aria-hidden="true">to</span>
          <app-date-input
            [inputId]="idPrefix() + 'To'"
            [ngModel]="value().to"
            (ngModelChange)="patch({ to: $event })"
            ariaLabel="To date"
            placeholder="To"
          />
        </div>
      </div>
    }
  `,
  styles: [
    `
      .period-field {
        flex: 0 0 auto;
        width: 12rem;
        min-width: 10rem;
        max-width: 100%;
        margin-bottom: 0;
      }
      .period-field--range {
        width: auto;
      }
      .period-range {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
      }
      .period-range app-date-input {
        width: 10rem;
      }
    `,
  ],
})
export class PeriodPickerComponent {
  value = model.required<PeriodValue>();
  /** Prefix for input ids, so two pickers on one page don't clash. */
  idPrefix = input('period');
  yearOptions = input<number[]>(defaultYears());

  readonly months = REPORT_MONTHS;
  readonly quarters = REPORT_QUARTERS;
  readonly typeOptions: { label: string; value: ReportPeriodType }[] = [
    { label: 'Month', value: 'month' },
    { label: 'Quarter', value: 'quarter' },
    { label: 'Custom range', value: 'custom' },
  ];

  patch(change: Partial<PeriodValue>) {
    this.value.set({ ...this.value(), ...change });
  }
}

/** Two years back through next year. */
function defaultYears(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
}
