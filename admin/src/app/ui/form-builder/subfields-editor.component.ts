import { Component, computed, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import {
  FORM_FIELD_TYPE_ICONS,
  FORM_FIELD_TYPE_LABELS,
  FORM_GROUP_MAX_SUBFIELDS,
  FORM_SUBFIELD_TYPES,
  isSelectFieldType,
  type FormSubfieldType,
} from '@upstart/back-office/shared';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { FieldOptionDraft, FieldOptionsEditorComponent } from '../field-options-editor/field-options-editor.component';

/** A sub-field being edited. `id` is empty for a new one; an existing one keeps its type. */
export type SubfieldDraft = { id: string; name: string; type: FormSubfieldType; options: FieldOptionDraft[] };

/**
 * The sub-fields of a repeating group in the field dialog: a name and type per sub-field (choices for selects),
 * Add sub-field, and delete. The type of a saved sub-field can't change.
 */
@Component({
  selector: 'app-subfields-editor',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, LucideIconComponent, FieldOptionsEditorComponent],
  template: `
    <div class="sfe">
      @for (sf of subfields(); track $index; let i = $index) {
        <div class="sfe-row">
          <div class="sfe-main">
            <input pInputText class="sfe-name" [ngModel]="sf.name" (ngModelChange)="patch(i, { name: $event })" placeholder="Sub-field name" [attr.aria-label]="'Sub-field ' + (i + 1) + ' name'" />
            <p-select
              class="sfe-type"
              [options]="typeOptions"
              optionLabel="label"
              optionValue="value"
              [ngModel]="sf.type"
              (ngModelChange)="setType(i, $event)"
              [disabled]="!!sf.id"
              appendTo="body"
              [ariaLabel]="'Sub-field ' + (i + 1) + ' type'"
            >
              <ng-template pTemplate="selectedItem" let-o>
                @if (o) {
                  <span class="sfe-type-option"><nmp-lucide-icon [name]="icon(o.value)" aria-hidden="true" />{{ o.label }}</span>
                }
              </ng-template>
              <ng-template pTemplate="item" let-o>
                <span class="sfe-type-option"><nmp-lucide-icon [name]="icon(o.value)" aria-hidden="true" />{{ o.label }}</span>
              </ng-template>
            </p-select>
            <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" [ariaLabel]="'Delete sub-field ' + (sf.name || i + 1)" [disabled]="subfields().length === 1" (onClick)="remove(i)" />
          </div>
          @if (isSelect(sf.type)) {
            <div class="sfe-options">
              <app-field-options-editor [options]="sf.options" (optionsChange)="patch(i, { options: $event })" />
            </div>
          }
        </div>
      }
      @if (canAdd()) {
        <div>
          <p-button label="Add sub-field" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="add()" />
        </div>
      }
    </div>
  `,
  styles: `
    .sfe {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .sfe-row {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .sfe-main {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .sfe-name {
      flex: 1;
      min-width: 0;
    }
    .sfe-type {
      width: 11rem;
      flex-shrink: 0;
    }
    .sfe-type-option {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }
  `,
})
export class SubfieldsEditorComponent {
  subfields = model<SubfieldDraft[]>([]);

  readonly typeOptions = FORM_SUBFIELD_TYPES.map((value) => ({ value, label: FORM_FIELD_TYPE_LABELS[value] }));
  readonly canAdd = computed(() => this.subfields().length < FORM_GROUP_MAX_SUBFIELDS);

  icon(type: FormSubfieldType) {
    return FORM_FIELD_TYPE_ICONS[type];
  }
  isSelect(type: FormSubfieldType) {
    return isSelectFieldType(type);
  }

  patch(index: number, change: Partial<SubfieldDraft>) {
    this.subfields.update((list) => list.map((sf, i) => (i === index ? { ...sf, ...change } : sf)));
  }

  setType(index: number, type: FormSubfieldType) {
    this.patch(index, {
      type,
      options: isSelectFieldType(type) && !this.subfields()[index].options.length ? [{ id: '', label: '' }, { id: '', label: '' }] : this.subfields()[index].options,
    });
  }

  add() {
    this.subfields.update((list) => [...list, { id: '', name: '', type: 'TEXT', options: [] }]);
  }

  remove(index: number) {
    this.subfields.update((list) => list.filter((_, i) => i !== index));
  }
}
