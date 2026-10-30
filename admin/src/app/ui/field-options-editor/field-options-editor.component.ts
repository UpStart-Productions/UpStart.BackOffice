import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { PROJECT_COLORS } from '../../task-manager/core/tm-format.util';
import { TmColorPickerComponent } from '../../task-manager/ui/color-picker.component';

/** A select option being edited. `id` is empty for a new option (the API assigns one). */
export type FieldOptionDraft = { id: string; label: string; color?: string; points?: number | null };

/**
 * The one editor for a select field's choices: a row per option (optional color, label, remove) and Add option.
 * Used by Task Manager custom fields (with colors) and the form builder (labels, plus points on scored forms).
 */
@Component({
  selector: 'app-field-options-editor',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputNumberModule, InputTextModule, TmColorPickerComponent],
  template: `
    <div class="field-options-editor">
      @for (o of options(); track $index) {
        <div class="field-options-row">
          @if (colors()) {
            <app-tm-color-picker [ngModel]="o.color" (ngModelChange)="setColor($index, $event)" />
          }
          <input
            pInputText
            [ngModel]="o.label"
            (ngModelChange)="setLabel($index, $event)"
            [attr.aria-label]="'Option ' + ($index + 1)"
            placeholder="Option"
            class="flex-1"
          />
          @if (points()) {
            <p-inputNumber
              [ngModel]="o.points ?? null"
              (ngModelChange)="setPoints($index, $event)"
              [attr.aria-label]="'Points for option ' + ($index + 1)"
              placeholder="Points"
              [useGrouping]="false"
              [minFractionDigits]="0"
              [maxFractionDigits]="2"
              inputStyleClass="field-options-points"
            />
          }
          <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" aria-label="Remove option" (onClick)="remove($index)" />
        </div>
      }
      <div>
        <p-button label="Add option" icon="pi pi-plus" [text]="true" size="small" (onClick)="add()" />
      </div>
    </div>
  `,
  styles: `
    .field-options-editor {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      margin-top: 0.5rem;
    }
    .field-options-row {
      display: flex;
      gap: 0.35rem;
      align-items: center;
    }
    :host ::ng-deep .field-options-points {
      width: 6rem;
    }
  `,
})
export class FieldOptionsEditorComponent {
  options = model<FieldOptionDraft[]>([]);
  /** Show a color swatch per option (Task Manager chips). */
  colors = input(false);
  /** Show a points box per option (scored forms). */
  points = input(false);

  add() {
    this.options.update((list) => [
      ...list,
      { id: '', label: '', ...(this.colors() ? { color: PROJECT_COLORS[list.length % PROJECT_COLORS.length] } : {}) },
    ]);
  }
  remove(i: number) {
    this.options.update((list) => list.filter((_, idx) => idx !== i));
  }
  setLabel(i: number, label: string) {
    this.options.update((list) => list.map((o, idx) => (idx === i ? { ...o, label } : o)));
  }
  setPoints(i: number, points: number | null) {
    this.options.update((list) => list.map((o, idx) => (idx === i ? { ...o, points } : o)));
  }
  setColor(i: number, color: string) {
    this.options.update((list) => list.map((o, idx) => (idx === i ? { ...o, color } : o)));
  }
}
