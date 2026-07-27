import { Component, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { dateKey, parseDateKey } from '../../core/date.util';

/**
 * Form date field using the same PrimeNG DatePicker as Timesheets.
 * Value is a local calendar date string (YYYY-MM-DD) or empty string.
 */
@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [FormsModule, DatePickerModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DateInputComponent),
      multi: true,
    },
  ],
  template: `
    <p-datepicker
      [inputId]="inputId()"
      [ngModel]="inner"
      (ngModelChange)="onInnerChange($event)"
      [disabled]="isDisabled"
      [placeholder]="placeholder()"
      [showIcon]="true"
      iconDisplay="input"
      dateFormat="M d, yy"
      [fluid]="true"
      appendTo="body"
      [attr.aria-label]="ariaLabel()"
    />
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `,
})
export class DateInputComponent implements ControlValueAccessor {
  inputId = input<string | undefined>(undefined);
  placeholder = input('Select date');
  ariaLabel = input<string | undefined>(undefined);
  /** Template binding for disabled state (also supports CVA setDisabledState). */
  disabledInput = input(false, { alias: 'disabled' });

  inner: Date | null = null;
  private formDisabled = false;

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  get isDisabled(): boolean {
    return this.formDisabled || this.disabledInput();
  }

  writeValue(value: string | null | undefined): void {
    this.inner = value ? parseDateKey(value) : null;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled = isDisabled;
  }

  onInnerChange(value: Date | null): void {
    this.inner = value;
    this.onChange(value ? dateKey(value) : '');
    this.onTouched();
  }
}
