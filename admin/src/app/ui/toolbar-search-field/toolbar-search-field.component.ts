import { Component, forwardRef, input } from '@angular/core';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';

/** Toolbar list filter: search icon left, filled grey clear control inside the field on the right. */
@Component({
  selector: 'app-toolbar-search-field',
  standalone: true,
  imports: [FormsModule, IconFieldModule, InputIconModule, InputTextModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ToolbarSearchFieldComponent),
      multi: true,
    },
  ],
  template: `
    <div class="search-input-with-clear">
      <p-iconfield
        iconPosition="left"
        class="toolbar-search-field"
        [class.toolbar-search-field--has-clear]="!!value"
      >
        <p-inputicon><i class="pi pi-search"></i></p-inputicon>
        <input
          pInputText
          type="text"
          class="w-full"
          [id]="inputId() || null"
          [placeholder]="placeholder()"
          [attr.aria-label]="ariaLabel()"
          [disabled]="disabled"
          [ngModel]="value"
          (ngModelChange)="onInput($event)"
          (blur)="onTouched()"
        />
      </p-iconfield>
      @if (value) {
        <button
          type="button"
          class="search-clear-inside"
          (click)="clear($event)"
          aria-label="Clear search"
        >
          <svg class="search-clear-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="12" cy="12" r="12" fill="currentColor" />
            <path
              d="M8.25 8.25l7.5 7.5M15.75 8.25l-7.5 7.5"
              fill="none"
              stroke="#fff"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      }
    </div>
  `,
  host: {
    class: 'toolbar-search-field-host',
  },
})
export class ToolbarSearchFieldComponent implements ControlValueAccessor {
  placeholder = input('');
  ariaLabel = input('Search');
  inputId = input<string | undefined>(undefined);

  protected value = '';
  protected disabled = false;
  protected onTouched: () => void = () => undefined;
  private onChange: (value: string) => void = () => undefined;

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(next: string): void {
    this.value = next;
    this.onChange(next);
  }

  clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.value = '';
    this.onChange('');
    this.onTouched();
  }
}
