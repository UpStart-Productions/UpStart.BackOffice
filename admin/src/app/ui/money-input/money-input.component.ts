import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';

/**
 * Dollar amount entry without PrimeNG InputNumber keystroke logic (which breaks sub-$1 values like 0.53).
 * Type freely (.53 or 0.53); blur applies min/max and formats with grouping off.
 */
@Component({
  selector: 'app-money-input',
  standalone: true,
  imports: [FormsModule, InputTextModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MoneyInputComponent),
      multi: true,
    },
  ],
  host: {
    '[class]': 'styleClass()',
  },
  template: `
    <span class="money-input-prefix" aria-hidden="true">$</span>
    <input
      pInputText
      type="text"
      inputmode="decimal"
      autocomplete="off"
      [attr.id]="inputId()"
      [attr.name]="name()"
      [class]="inputStyleClass()"
      [disabled]="inputDisabled"
      [placeholder]="placeholder()"
      [ngModel]="displayText()"
      (ngModelChange)="onTextChange($event)"
      (focus)="onFocus()"
      (blur)="onBlur()"
    />
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: stretch;
      max-width: 100%;
    }

    :host.w-full {
      width: 100%;
    }

    .money-input-prefix {
      display: flex;
      align-items: center;
      padding: 0 0.75rem;
      border: 1px solid var(--p-inputtext-border-color, var(--surface-border));
      border-right: 0;
      border-radius: var(--p-inputtext-border-radius, 6px) 0 0 var(--p-inputtext-border-radius, 6px);
      background: var(--p-inputtext-background, var(--surface-ground));
      color: var(--text-color-secondary);
      font-size: var(--fs-base);
    }

    :host ::ng-deep .p-inputtext {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      flex: 1 1 auto;
      min-width: 0;
      text-align: right;
    }
  `,
})
export class MoneyInputComponent implements ControlValueAccessor {
  inputId = input<string>();
  name = input<string>();
  styleClass = input('');
  inputStyleClass = input('');
  placeholder = input('');
  min = input(0);
  max = input<number | undefined>(undefined);
  minFractionDigits = input(2);
  maxFractionDigits = input(4);
  /** When true, the field cannot be edited (e.g. non-billable booking price). */
  disabled = input(false);

  private stored: number | null = null;
  private formDisabled = false;

  protected get inputDisabled(): boolean {
    return this.disabled() || this.formDisabled;
  }
  private readonly editing = signal(false);
  private readonly draft = signal('');

  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  displayText(): string {
    if (this.editing()) {
      return this.draft();
    }
    return this.format(this.stored);
  }

  writeValue(v: number | null): void {
    if (v == null || Number.isNaN(Number(v))) {
      this.stored = null;
    } else {
      this.stored = Number(v);
    }
  }

  registerOnChange(fn: (v: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.formDisabled = isDisabled;
  }

  onFocus(): void {
    this.editing.set(true);
    this.draft.set(this.stored == null ? '' : String(this.stored));
  }

  onTextChange(raw: string): void {
    if (!this.editing()) {
      return;
    }
    this.draft.set(sanitizeMoneyDraft(raw, this.maxFractionDigits()));
  }

  onBlur(): void {
    const next = parseMoneyDraft(this.draft(), {
      min: this.min(),
      max: this.max(),
      maxFractionDigits: this.maxFractionDigits(),
    });
    this.stored = next;
    this.editing.set(false);
    this.draft.set('');
    this.onChange(next);
    this.onTouched();
  }

  private format(n: number | null): string {
    if (n == null) {
      return '';
    }
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: this.minFractionDigits(),
      maximumFractionDigits: this.maxFractionDigits(),
      useGrouping: false,
    }).format(n);
  }
}

/** Digits and at most one decimal point; cap fractional length while typing. */
export function sanitizeMoneyDraft(raw: string, maxFractionDigits: number): string {
  let s = raw.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    const frac = s.slice(dot + 1);
    if (frac.length > maxFractionDigits) {
      s = s.slice(0, dot + 1 + maxFractionDigits);
    }
  }
  return s;
}

export function parseMoneyDraft(
  raw: string,
  opts: { min: number; max?: number; maxFractionDigits: number },
): number | null {
  const t = raw.trim();
  if (!t || t === '.') {
    return null;
  }
  let n = Number(t);
  if (!Number.isFinite(n)) {
    return null;
  }
  if (n < opts.min) {
    n = opts.min;
  }
  if (opts.max != null && n > opts.max) {
    n = opts.max;
  }
  const scale = 10 ** opts.maxFractionDigits;
  return Math.round(n * scale) / scale;
}
