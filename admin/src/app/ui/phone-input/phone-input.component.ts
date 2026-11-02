import { AfterViewInit, Component, ElementRef, effect, input, output, signal, viewChild } from '@angular/core';
import { InputTextModule } from 'primeng/inputtext';
import { formatPhoneDigits } from '@upstart/back-office/shared';

/**
 * US phone entry: formats as (503) 555-1234 while typing (a leading 1 is dropped). Emits the formatted number once
 * all 10 digits are in, null when cleared or incomplete.
 */
@Component({
  selector: 'app-phone-input',
  standalone: true,
  imports: [InputTextModule],
  template: `
    <input
      #box
      pInputText
      type="tel"
      inputmode="tel"
      autocomplete="tel"
      class="w-full"
      placeholder="(555) 555-5555"
      [attr.id]="inputId()"
      [disabled]="disabled()"
      (input)="onInput()"
      (blur)="touched.set(true)"
    />
    @if (touched() && digits().length > 0 && digits().length < 10) {
      <small class="phone-hint">Enter a 10-digit phone number</small>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .phone-hint {
      color: var(--p-red-500);
    }
  `,
})
export class PhoneInputComponent implements AfterViewInit {
  readonly inputId = input<string>();
  readonly value = input<string | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<string | null>();

  protected readonly digits = signal('');
  protected readonly touched = signal(false);
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  private emitted: string | null = null;

  constructor() {
    effect(() => {
      const v = this.value();
      if (v === this.emitted) return;
      this.emitted = v;
      this.digits.set(this.clean(String(v ?? '')));
      this.render();
    });
  }

  ngAfterViewInit() {
    this.render();
  }

  private clean(raw: string) {
    let d = raw.replace(/\D/g, '');
    if (d.length > 10 && d.startsWith('1')) d = d.slice(1);
    return d.slice(0, 10);
  }

  private render() {
    const el = this.box()?.nativeElement;
    if (el) el.value = formatPhoneDigits(this.digits());
  }

  protected onInput() {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const before = formatPhoneDigits(this.digits());
    let raw = el.value;
    // Backspace over ")", a space or "-": take out the digit before it.
    if (raw.length < before.length && raw.replace(/\D/g, '') === this.digits()) raw = raw.replace(/\d(\D*)$/, '$1');
    const atEnd = el.selectionStart === el.value.length;
    this.digits.set(this.clean(raw));
    const caret = el.selectionStart;
    this.render();
    if (!atEnd && caret !== null) el.setSelectionRange(caret, caret);
    const out = this.digits().length === 10 ? formatPhoneDigits(this.digits()) : null;
    if (out !== this.emitted) {
      this.emitted = out;
      this.valueChange.emit(out);
    }
  }
}
