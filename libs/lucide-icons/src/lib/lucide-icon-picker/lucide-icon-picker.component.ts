import { CommonModule } from '@angular/common';
import { OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { LucideIconComponent } from '../lucide-icon/lucide-icon.component';
import { LucideIconPickerPanelComponent } from '../lucide-icon-picker-panel/lucide-icon-picker-panel.component';
import { normalizeLucideIconName, parseLucideIconNameFromMarkup } from '../lucide-icon-name';

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
];

export type LucideIconPickerValueFormat = 'name' | 'inline-svg';

/**
 * Drop-in ControlValueAccessor for picking a Lucide icon.
 *
 * - `valueFormat="name"` (default): form value is the icon name string, e.g. `"phone"`.
 * - `valueFormat="inline-svg"`: form value is self-contained HTML for a DB column (paths included).
 */
@Component({
  selector: 'nmp-lucide-icon-picker',
  standalone: true,
  imports: [CommonModule, OverlayModule, LucideIconComponent, LucideIconPickerPanelComponent],
  templateUrl: './lucide-icon-picker.component.html',
  styleUrl: './lucide-icon-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => LucideIconPickerComponent),
      multi: true,
    },
  ],
})
export class LucideIconPickerComponent implements ControlValueAccessor {
  readonly panel = viewChild(LucideIconPickerPanelComponent);

  /** How the selected icon is written to the form model. */
  readonly valueFormat = input<LucideIconPickerValueFormat>('name');

  readonly positions = POSITIONS;

  value = signal<string | null>(null);
  open = signal(false);
  disabled = signal(false);

  /** Icon name for preview, whether the model stores a name or inline SVG. */
  readonly previewName = computed(() => {
    const v = this.value();
    if (!v) return null;
    if (this.valueFormat() === 'inline-svg') {
      return parseLucideIconNameFromMarkup(v);
    }
    return normalizeLucideIconName(v);
  });

  readonly previewLabel = computed(() => {
    const name = this.previewName();
    if (name) return name;
    const v = this.value();
    if (this.valueFormat() === 'inline-svg' && v?.trim()) return 'Custom icon';
    return 'Choose icon…';
  });

  private onChange: (v: string | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(v: string | null): void {
    this.value.set(v ?? null);
  }

  registerOnChange(fn: (v: string | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  toggle(): void {
    if (this.disabled()) return;
    this.open.update((v) => !v);
    if (this.open()) {
      queueMicrotask(() => this.panel()?.focusSearch());
    } else {
      this.onTouched();
    }
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.onTouched();
  }

  onSelect(name: string): void {
    const normalized = normalizeLucideIconName(name);
    this.close();
    if (this.valueFormat() !== 'inline-svg') {
      this.value.set(normalized);
      this.onChange(normalized);
      return;
    }
    // Back Office: the path table is lazy so it stays out of the initial bundle.
    void import('../lucide-icon-markup').then(({ buildLucideIconMarkup }) => {
      const stored = buildLucideIconMarkup(normalized);
      this.value.set(stored);
      this.onChange(stored);
    });
  }

  clear(): void {
    if (this.disabled()) return;
    this.value.set(null);
    this.onChange(null);
    this.onTouched();
  }
}
