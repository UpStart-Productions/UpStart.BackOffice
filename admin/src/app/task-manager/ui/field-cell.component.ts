import { Component, computed, ElementRef, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';
import { dateKey, parseDateKey } from '../../core/date.util';
import { dueLabel, fieldOptionChipColors } from '../core/tm-format.util';
import { FieldOption, TmField } from '../core/tm.types';

/** Display + edit a custom field value (grid cell or detail-panel row). */
@Component({
  selector: 'app-tm-field-cell',
  standalone: true,
  imports: [FormsModule, PopoverModule, DatePickerModule],
  host: { class: 'tm-field-cell-host' },
  template: `
    @switch (field().type) {
      @case ('TEXT') {
        @if (editing()) {
          <input
            class="tm-cell-input"
            [ngModel]="textDraft"
            (ngModelChange)="textDraft = $event"
            (blur)="commitText()"
            (keydown.enter)="commitText()"
            (keydown.escape)="editing.set(false)"
            [attr.aria-label]="field().name"
            autofocus
          />
        } @else {
          <button type="button" class="tm-cell-btn" [disabled]="!editable()" (click)="startText()">
            @if (value()) { <span class="tm-cell-text">{{ value() }}</span> } @else { <span class="tm-cell-placeholder">—</span> }
          </button>
        }
      }
      @case ('NUMBER') {
        @if (editing()) {
          <input
            class="tm-cell-input"
            type="number"
            [ngModel]="textDraft"
            (ngModelChange)="textDraft = $event"
            (blur)="commitNumber()"
            (keydown.enter)="commitNumber()"
            (keydown.escape)="editing.set(false)"
            [attr.aria-label]="field().name"
            autofocus
          />
        } @else {
          <button type="button" class="tm-cell-btn tm-cell-num" [disabled]="!editable()" (click)="startText()">
            @if (value() !== null && value() !== undefined) { {{ value() }} } @else { <span class="tm-cell-placeholder">—</span> }
          </button>
        }
      }
      @case ('CHECKBOX') {
        <button type="button" class="tm-cell-btn" [disabled]="!editable()" (click)="changed.emit(!value())" [attr.aria-pressed]="!!value()" [attr.aria-label]="field().name">
          <i class="pi" [class.pi-check-square]="!!value()" [class.pi-stop]="!value()"></i>
        </button>
      }
      @case ('DATE') {
        <button type="button" class="tm-cell-btn" [disabled]="!editable()" (click)="openDate($event)">
          @if (value()) { {{ dateText() }} } @else { <span class="tm-cell-placeholder">—</span> }
        </button>
      }
      @default {
        <button type="button" class="tm-cell-btn tm-cell-chips" [disabled]="!editable()" (click)="openOptions($event)">
          @for (o of selectedOptions(); track o.id) {
            <span class="tm-chip tm-tag" [style.background]="chip(o).bg" [style.color]="chip(o).fg">{{ o.label }}</span>
          } @empty {
            <span class="tm-cell-placeholder">—</span>
          }
        </button>
      }
    }

    <p-popover #optionsPop appendTo="body" styleClass="tm-popover">
      <ul class="tm-picker-list tm-option-list">
        @for (o of field().options; track o.id) {
          <li>
            <button type="button" class="tm-picker-item" [class.selected]="isSelected(o)" (click)="toggleOption(o)">
              @if (field().type === 'MULTI_SELECT') {
                <i class="pi" [class.pi-check-square]="isSelected(o)" [class.pi-stop]="!isSelected(o)"></i>
              }
              <span class="tm-chip tm-tag" [style.background]="chip(o).bg" [style.color]="chip(o).fg">{{ o.label }}</span>
            </button>
          </li>
        } @empty {
          <li class="tm-picker-empty">No options — add some under Customize</li>
        }
        @if (selectedOptions().length) {
          <li><button type="button" class="tm-picker-item tm-picker-clear" (click)="clear()">Clear</button></li>
        }
      </ul>
    </p-popover>

    <p-popover #datePop appendTo="body" styleClass="tm-popover">
      <p-datepicker [inline]="true" [ngModel]="dateValue()" (ngModelChange)="pickDate($event)" />
      @if (value()) {
        <button type="button" class="tm-picker-item tm-picker-clear" (click)="clear(); datePop.hide()">Clear</button>
      }
    </p-popover>
  `,
})
export class TmFieldCellComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

  field = input.required<TmField>();
  value = input<unknown>(null);
  editable = input(true);
  changed = output<unknown>();

  editing = signal(false);
  textDraft: string | number | null = '';
  private readonly optionsPop = viewChild.required<Popover>('optionsPop');
  private readonly datePop = viewChild.required<Popover>('datePop');

  selectedIds = computed<string[]>(() => {
    const v = this.value();
    if (Array.isArray(v)) return v as string[];
    return typeof v === 'string' ? [v] : [];
  });
  selectedOptions = computed(() => this.field().options.filter((o) => this.selectedIds().includes(o.id)));
  dateValue = computed(() => (typeof this.value() === 'string' ? parseDateKey(this.value() as string) : null));
  dateText = computed(() => dueLabel(typeof this.value() === 'string' ? (this.value() as string) : null));

  chip(o: FieldOption) {
    return fieldOptionChipColors(o.color);
  }

  isSelected(o: FieldOption) {
    return this.selectedIds().includes(o.id);
  }

  startText() {
    if (!this.editable()) return;
    this.textDraft = (this.value() as string | number | null) ?? '';
    this.editing.set(true);
  }

  commitText() {
    if (!this.editing()) return;
    this.editing.set(false);
    const next = String(this.textDraft ?? '').trim();
    if (next !== String(this.value() ?? '')) this.changed.emit(next || null);
  }

  commitNumber() {
    if (!this.editing()) return;
    this.editing.set(false);
    const raw = this.textDraft;
    const next = raw === '' || raw === null ? null : Number(raw);
    if (next !== null && !Number.isFinite(next)) return;
    if (next !== this.value()) this.changed.emit(next);
  }

  openOptions(event: Event) {
    if (!this.editable()) return;
    event.stopPropagation();
    this.optionsPop().show(event, this.host.nativeElement);
  }

  toggleOption(o: FieldOption) {
    if (this.field().type === 'SINGLE_SELECT') {
      this.changed.emit(this.isSelected(o) ? null : o.id);
      this.optionsPop().hide();
      return;
    }
    const ids = this.isSelected(o) ? this.selectedIds().filter((id) => id !== o.id) : [...this.selectedIds(), o.id];
    this.changed.emit(ids.length ? ids : null);
  }

  openDate(event: Event) {
    if (!this.editable()) return;
    event.stopPropagation();
    this.datePop().show(event, this.host.nativeElement);
  }

  pickDate(d: Date | null) {
    this.changed.emit(d ? dateKey(d) : null);
    this.datePop().hide();
  }

  clear() {
    this.changed.emit(null);
    this.optionsPop().hide();
  }
}
