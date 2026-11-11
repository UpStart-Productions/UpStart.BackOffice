import { AfterViewInit, Component, ElementRef, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import {
  parseMoneyDraft,
  roundMoney,
  sanitizeMoneyDraft,
} from '../money-input/money-input.component';

/**
 * Plain decimal entry (digits + one decimal point). Same mask as app-money-input, without a currency prefix.
 */
@Component({
  selector: 'app-decimal-input',
  standalone: true,
  imports: [InputTextModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DecimalInputComponent),
      multi: true,
    },
  ],
  host: {
    '[class]': 'styleClass()',
  },
  template: `
    <input
      #box
      pInputText
      type="text"
      inputmode="decimal"
      autocomplete="off"
      [attr.id]="inputId()"
      [attr.name]="name()"
      [class]="inputStyleClass()"
      [disabled]="inputDisabled"
      [placeholder]="placeholder()"
      (input)="onInput()"
      (focus)="onFocus()"
      (blur)="onBlur()"
    />
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }

    :host.w-full {
      width: 100%;
    }

    :host ::ng-deep .p-inputtext {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
    }
  `,
})
export class DecimalInputComponent implements ControlValueAccessor, AfterViewInit {
  inputId = input<string>();
  name = input<string>();
  styleClass = input('');
  inputStyleClass = input('');
  placeholder = input('');
  min = input(0);
  max = input<number | undefined>(undefined);
  minFractionDigits = input(0);
  maxFractionDigits = input(4);
  disabled = input(false);
  /** Emit parsed value on each keystroke (e.g. invoice line amount). */
  updateWhileTyping = input(false);
  /** Treat blank as 0 instead of null (invoice qty/rate). */
  emptyAsZero = input(false);
  /** When value is 0, show an empty field until focus. */
  showEmptyWhenZero = input(true);

  private stored: number | null = null;
  private formDisabled = false;

  protected get inputDisabled(): boolean {
    return this.disabled() || this.formDisabled;
  }

  private readonly editing = signal(false);
  private readonly draft = signal('');
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');

  private onChange: (v: number | null) => void = () => {};
  private onTouched: () => void = () => {};

  ngAfterViewInit() {
    this.render();
  }

  writeValue(v: number | null): void {
    if (v == null || Number.isNaN(Number(v))) {
      this.stored = this.emptyAsZero() ? 0 : null;
    } else {
      this.stored = roundMoney(Number(v), this.maxFractionDigits());
    }
    if (!this.editing()) {
      this.render();
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
    if (this.showEmptyWhenZero() && (this.stored === 0 || this.stored == null)) {
      this.draft.set('');
    } else {
      this.draft.set(this.stored == null ? '' : this.format(this.stored));
    }
    this.render();
  }

  onInput(): void {
    const el = this.box()?.nativeElement;
    if (!el || !this.editing()) {
      return;
    }
    const next = sanitizeMoneyDraft(el.value, this.maxFractionDigits());
    this.draft.set(next);
    if (el.value !== next) {
      const pos = el.selectionStart ?? next.length;
      el.value = next;
      const newPos = Math.min(pos, next.length);
      el.setSelectionRange(newPos, newPos);
    }
    if (this.updateWhileTyping()) {
      this.emitChangeFromDraft();
    }
  }

  onBlur(): void {
    const next = parseMoneyDraft(this.draft(), {
      min: this.min(),
      max: this.max(),
      maxFractionDigits: this.maxFractionDigits(),
    });
    this.stored = this.emptyAsZero() ? (next ?? 0) : next;
    this.editing.set(false);
    this.draft.set('');
    this.emitChangeFromStored();
    this.onTouched();
    this.render();
  }

  private emitChangeFromDraft(): void {
    const next = parseMoneyDraft(this.draft(), {
      min: this.min(),
      max: this.max(),
      maxFractionDigits: this.maxFractionDigits(),
    });
    this.onChange(this.emptyAsZero() ? (next ?? 0) : next);
  }

  private emitChangeFromStored(): void {
    this.onChange(this.stored);
  }

  private render(): void {
    const el = this.box()?.nativeElement;
    if (!el) {
      return;
    }
    if (this.editing()) {
      el.value = this.draft();
      return;
    }
    if (this.showEmptyWhenZero() && (this.stored === 0 || this.stored == null)) {
      el.value = '';
      return;
    }
    el.value = this.format(this.stored);
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
