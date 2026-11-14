import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { SelectModule } from 'primeng/select';

/** "HH:mm" (24h) → "9:00 AM". */
export function timeLabel(value: string): string {
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/**
 * The app's time picker: the standard dropdown with times every 15 minutes ("9:00 AM").
 * Value is "HH:mm" (24h), the same as <input type="time">, so it drops into existing ngModel bindings.
 * A value off the 15-minute grid (e.g. 09:10) is kept and listed.
 */
@Component({
  selector: 'app-time-input',
  standalone: true,
  imports: [FormsModule, SelectModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeInputComponent), multi: true }],
  template: `
    <p-select
      [inputId]="inputId() ?? undefined"
      [options]="options()"
      optionLabel="label"
      optionValue="value"
      optionDisabled="disabled"
      [ngModel]="value()"
      (ngModelChange)="pick($event)"
      [disabled]="disabled()"
      [placeholder]="placeholder()"
      [ariaLabel]="ariaLabel() ?? undefined"
      [scrollHeight]="'16rem'"
      appendTo="body"
      styleClass="w-full"
      (onBlur)="onTouched()"
    />
  `,
})
export class TimeInputComponent implements ControlValueAccessor {
  inputId = input<string | null>(null);
  ariaLabel = input<string | null>(null);
  placeholder = input('Pick a time');
  /** Minutes between options. */
  step = input(15);
  /** End-time picker: the start time ("HH:mm"). Options are limited to after it. */
  after = input<string | null>(null);
  /**
   * With after: true lets the end run past midnight (overnight shifts) — the list starts after the start time and
   * wraps, marking times past midnight "(next day)". false grays out times at or before the start.
   */
  overnight = input(false);

  value = signal<string | null>(null);
  disabled = signal(false);

  readonly options = computed(() => {
    const out: { label: string; value: string; disabled?: boolean }[] = [];
    for (let m = 0; m < 24 * 60; m += this.step()) {
      const v = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      out.push({ label: timeLabel(v), value: v });
    }
    const cur = this.value();
    if (cur && !out.some((o) => o.value === cur)) {
      out.push({ label: timeLabel(cur), value: cur });
      out.sort((a, b) => a.value.localeCompare(b.value));
    }
    const start = this.after();
    if (!start) return out;
    if (!this.overnight()) return out.map((o) => (o.value <= start ? { ...o, disabled: true } : o));
    // Overnight allowed: later today first, then past midnight up to the start time, marked (next day).
    const later = out.filter((o) => o.value > start);
    const nextDay = out.filter((o) => o.value <= start).map((o) => ({ ...o, label: `${o.label} (next day)` }));
    return [...later, ...nextDay];
  });

  private onChange: (v: string | null) => void = () => {};
  onTouched: () => void = () => {};

  pick(v: string | null) {
    this.value.set(v);
    this.onChange(v);
  }

  writeValue(v: string | null): void {
    this.value.set(v ? v.slice(0, 5) : null);
  }
  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(d: boolean): void {
    this.disabled.set(d);
  }
}
