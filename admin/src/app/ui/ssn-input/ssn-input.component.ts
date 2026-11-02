import { AfterViewInit, Component, ElementRef, effect, input, OnDestroy, output, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { formatSsnDigits } from '@upstart/back-office/shared';

/**
 * Social Security number entry: formats as xxx-xx-xxxx while typing, shows ***-**-**** by default and each digit
 * turns into * a second after it's typed. The eye shows or hides the number. Emits 123-45-6789 once all 9 digits
 * are in, null when cleared or incomplete.
 */
@Component({
  selector: 'app-ssn-input',
  standalone: true,
  imports: [ButtonModule, InputTextModule],
  template: `
    <div class="ssn-input">
      <input
        #box
        pInputText
        type="text"
        inputmode="numeric"
        autocomplete="off"
        spellcheck="false"
        class="w-full"
        placeholder="***-**-****"
        [attr.id]="inputId()"
        [disabled]="disabled()"
        (input)="onInput()"
        (blur)="touched.set(true)"
      />
      <p-button
        [icon]="revealed() ? 'pi pi-eye-slash' : 'pi pi-eye'"
        [text]="true"
        severity="secondary"
        [ariaLabel]="revealed() ? 'Hide number' : 'Show number'"
        (onClick)="toggle()"
      />
    </div>
    @if (touched() && digits().length > 0 && digits().length < 9) {
      <small class="ssn-hint">Enter all 9 digits</small>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ssn-input {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .ssn-hint {
      color: var(--p-red-500);
    }
  `,
})
export class SsnInputComponent implements AfterViewInit, OnDestroy {
  readonly inputId = input<string>();
  readonly value = input<string | null>(null);
  readonly disabled = input(false);
  readonly valueChange = output<string | null>();

  protected readonly revealed = signal(false);
  protected readonly touched = signal(false);
  protected readonly digits = signal('');
  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  /** Digits typed in the last second stay readable. */
  private readonly fresh = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private emitted: string | null = null;

  constructor() {
    effect(() => {
      const v = this.value();
      if (v === this.emitted) return;
      this.emitted = v;
      this.digits.set(String(v ?? '').replace(/\D/g, '').slice(0, 9));
      this.fresh.clear();
      this.render();
    });
  }

  ngAfterViewInit() {
    this.render();
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  protected toggle() {
    this.revealed.set(!this.revealed());
    this.render();
  }

  /** What shows: the formatted number, each digit as * unless shown (eye) or just typed. */
  private display(): string {
    const m = [...this.digits()].map((c, i) => (this.revealed() || this.fresh.has(i) ? c : '*')).join('');
    return m.length <= 3 ? m : m.length <= 5 ? `${m.slice(0, 3)}-${m.slice(3)}` : `${m.slice(0, 3)}-${m.slice(3, 5)}-${m.slice(5)}`;
  }

  private render(caretDigits?: number) {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const text = this.display();
    el.value = text;
    if (caretDigits !== undefined && document.activeElement === el) {
      const pos = caretDigits + (caretDigits > 3 ? 1 : 0) + (caretDigits > 5 ? 1 : 0);
      el.setSelectionRange(pos, pos);
    }
  }

  /** Work out what was typed or deleted by comparing the box with what was shown (the shown digits may be *). */
  protected onInput() {
    const el = this.box()?.nativeElement;
    if (!el) return;
    const before = this.display();
    const after = el.value;
    let p = 0;
    while (p < before.length && p < after.length && before[p] === after[p]) p++;
    let s = 0;
    while (s < before.length - p && s < after.length - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
    const removed = before.slice(p, before.length - s);
    const inserted = after.slice(p, after.length - s).replace(/\D/g, '');
    const slot = (t: string) => t.replace(/[^\d*]/g, '').length;
    let start = slot(before.slice(0, p));
    let removedCount = slot(removed);
    // Backspace over a dash: take out the digit before it.
    if (removed && !removedCount && !inserted && start > 0) {
      start -= 1;
      removedCount = 1;
    }
    const old = this.digits();
    const next = (old.slice(0, start) + inserted + old.slice(start + removedCount)).slice(0, 9);
    // Keep "just typed" marks only for the new digits.
    this.fresh.clear();
    for (let i = start; i < Math.min(9, start + inserted.length); i++) this.fresh.add(i);
    this.digits.set(next);
    this.render(Math.min(next.length, start + inserted.length));
    if (this.timer) clearTimeout(this.timer);
    if (this.fresh.size) {
      this.timer = setTimeout(() => {
        this.fresh.clear();
        const at = el.selectionStart;
        this.render();
        if (at !== null && document.activeElement === el) el.setSelectionRange(at, at);
      }, 1000);
    }
    const out = next.length === 9 ? formatSsnDigits(next) : null;
    if (out !== this.emitted) {
      this.emitted = out;
      this.valueChange.emit(out);
    }
  }
}
