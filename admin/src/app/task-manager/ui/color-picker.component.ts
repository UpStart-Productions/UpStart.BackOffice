import { Component, forwardRef, input, signal, viewChild } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Popover, PopoverModule } from 'primeng/popover';
import { PROJECT_COLORS } from '../core/tm-format.util';

/** Grey square trigger; opens the shared task-manager color popover. Supports `ngModel`. */
@Component({
  selector: 'app-tm-color-picker',
  standalone: true,
  imports: [PopoverModule],
  template: `
    <div class="tm-color-picker">
      <button
        type="button"
        class="tm-color-swatch tm-color-picker-trigger"
        [style.background]="value() ?? defaultGrey"
        [disabled]="disabled()"
        aria-haspopup="dialog"
        aria-label="Choose color"
        (click)="toggle($event)"
      ></button>
      <p-popover #pop appendTo="body" styleClass="tm-popover">
        <div class="tm-appearance tm-color-picker-popover">
          <div class="tm-appearance-label">Color</div>
          <div class="tm-color-swatches tm-color-swatches--row">
            @for (c of colors(); track c) {
              <button
                type="button"
                class="tm-color-swatch"
                [class.selected]="value() === c"
                [style.background]="c"
                [attr.aria-label]="'Color ' + c"
                [attr.aria-pressed]="value() === c"
                (click)="pick(c)"
              ></button>
            }
          </div>
        </div>
      </p-popover>
    </div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TmColorPickerComponent),
      multi: true,
    },
  ],
})
export class TmColorPickerComponent implements ControlValueAccessor {
  private readonly pop = viewChild.required<Popover>('pop');

  /** Palette to show in the popover. Defaults to project colors. */
  colors = input<string[]>([...PROJECT_COLORS]);

  readonly defaultGrey = '#94a3b8';
  disabled = signal(false);
  value = signal<string | null>(null);

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggle(event: Event) {
    event.stopPropagation();
    if (this.disabled()) return;
    this.pop().toggle(event);
    this.onTouched();
  }

  pick(color: string) {
    this.value.set(color);
    this.onChange(color);
    this.pop().hide();
  }
}
