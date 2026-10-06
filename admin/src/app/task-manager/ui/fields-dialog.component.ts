import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TmApiService } from '../core/tm-api.service';
import { OPTION_COLOR_HEX } from '../core/tm-format.util';
import { FieldOption, FieldType, TmField, TmProject } from '../core/tm.types';

const TYPE_LABELS: Record<FieldType, string> = {
  TEXT: 'Text',
  NUMBER: 'Number',
  DATE: 'Date',
  SINGLE_SELECT: 'Single-select',
  MULTI_SELECT: 'Multi-select',
  CHECKBOX: 'Checkbox',
};

/** Manage a project's custom fields (Asana "Customize"). */
@Component({
  selector: 'app-tm-fields-dialog',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, DialogModule, ButtonModule, InputTextModule, SelectModule],
  template: `
    <p-dialog header="Custom fields" [(visible)]="visible" [modal]="true" [style]="{ width: '36rem' }" (onShow)="reset()" [draggable]="false">
      <ul class="tm-field-list">
        @for (f of project().customFields; track f.id) {
          <li class="tm-field-item">
            @if (editingId() === f.id) {
              <div class="tm-field-edit">
                <input pInputText [(ngModel)]="draftName" aria-label="Field name" class="w-full" />
                @if (isSelect(f.type)) {
                  <ng-container *ngTemplateOutlet="optionsEditor"></ng-container>
                }
                <div class="flex gap-2 justify-content-end">
                  <p-button label="Cancel" size="small" [text]="true" severity="secondary" (onClick)="editingId.set(null)" />
                  <p-button label="Save" size="small" (onClick)="saveEdit(f)" />
                </div>
              </div>
            } @else {
              <div class="tm-field-summary">
                <strong>{{ f.name }}</strong>
                <span class="tm-muted">{{ typeLabel(f.type) }}</span>
                @if (isSelect(f.type)) {
                  <span class="tm-field-options">
                    @for (o of f.options; track o.id) {
                      <span class="tm-chip" [style.background]="chip(o).bg" [style.color]="chip(o).fg">{{ o.label }}</span>
                    }
                  </span>
                }
              </div>
              <button type="button" class="tm-icon-btn" (click)="startEdit(f)" [attr.aria-label]="'Edit ' + f.name"><i class="pi pi-pencil"></i></button>
              <button type="button" class="tm-icon-btn" (click)="remove(f)" [attr.aria-label]="'Delete ' + f.name"><i class="pi pi-trash"></i></button>
            }
          </li>
        } @empty {
          <li class="tm-muted">No custom fields yet. Add one for things like Priority, Estimate or Status.</li>
        }
      </ul>

      @if (editingId() === null) {
        <div class="tm-field-new">
          <h4>Add field</h4>
          <div class="flex gap-2">
            <input pInputText [(ngModel)]="draftName" placeholder="Field name" aria-label="New field name" class="flex-1" />
            <p-select [options]="typeOptions" optionLabel="label" optionValue="value" [(ngModel)]="draftType" appendTo="body" />
          </div>
          @if (isSelect(draftType)) {
            <ng-container *ngTemplateOutlet="optionsEditor"></ng-container>
          }
          <div class="flex justify-content-end mt-2">
            <p-button label="Add field" icon="pi pi-plus" size="small" (onClick)="create()" [disabled]="!draftName.trim()" [loading]="busy()" />
          </div>
        </div>
      }

      <ng-template #optionsEditor>
        <div class="tm-options-editor">
          @for (o of draftOptions(); track $index) {
            <div class="tm-option-row">
              <select class="tm-option-color" [ngModel]="o.color" (ngModelChange)="setOptionColor($index, $event)" aria-label="Option color">
                @for (c of colorNames; track c) {
                  <option [value]="c">{{ c }}</option>
                }
              </select>
              <input pInputText [ngModel]="o.label" (ngModelChange)="setOptionLabel($index, $event)" aria-label="Option label" class="flex-1" />
              <button type="button" class="tm-icon-btn" (click)="removeOption($index)" aria-label="Remove option"><i class="pi pi-times"></i></button>
            </div>
          }
          <button type="button" class="tm-link-btn" (click)="addOption()"><i class="pi pi-plus"></i> Add option</button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class TmFieldsDialogComponent {
  private readonly api = inject(TmApiService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  visible = model(false);
  project = input.required<TmProject>();
  changed = output<void>();

  readonly typeOptions = (Object.keys(TYPE_LABELS) as FieldType[]).map((value) => ({ value, label: TYPE_LABELS[value] }));
  readonly colorNames = Object.keys(OPTION_COLOR_HEX);
  editingId = signal<string | null>(null);
  draftName = '';
  draftType: FieldType = 'SINGLE_SELECT';
  draftOptions = signal<FieldOption[]>([]);
  busy = signal(false);

  constructor() {
    this.reset();
  }

  typeLabel(t: FieldType) {
    return TYPE_LABELS[t];
  }
  isSelect(t: FieldType) {
    return t === 'SINGLE_SELECT' || t === 'MULTI_SELECT';
  }
  chip(o: FieldOption) {
    return OPTION_COLOR_HEX[o.color ?? 'gray'] ?? OPTION_COLOR_HEX['gray'];
  }

  reset() {
    this.editingId.set(null);
    this.draftName = '';
    this.draftType = 'SINGLE_SELECT';
    this.draftOptions.set([
      { id: '', label: 'High', color: 'red' },
      { id: '', label: 'Medium', color: 'yellow' },
      { id: '', label: 'Low', color: 'green' },
    ]);
  }

  startEdit(f: TmField) {
    this.editingId.set(f.id);
    this.draftName = f.name;
    this.draftOptions.set(f.options.map((o) => ({ ...o })));
  }

  addOption() {
    const colors = this.colorNames;
    this.draftOptions.update((list) => [...list, { id: '', label: '', color: colors[list.length % colors.length] }]);
  }
  removeOption(i: number) {
    this.draftOptions.update((list) => list.filter((_, idx) => idx !== i));
  }
  setOptionLabel(i: number, label: string) {
    this.draftOptions.update((list) => list.map((o, idx) => (idx === i ? { ...o, label } : o)));
  }
  setOptionColor(i: number, color: string) {
    this.draftOptions.update((list) => list.map((o, idx) => (idx === i ? { ...o, color } : o)));
  }

  private cleanOptions(): FieldOption[] {
    return this.draftOptions()
      .filter((o) => o.label.trim())
      .map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim(), color: o.color }) as FieldOption);
  }

  async create() {
    this.busy.set(true);
    try {
      await this.api.createField(this.project().id, {
        name: this.draftName.trim(),
        type: this.draftType,
        ...(this.isSelect(this.draftType) ? { options: this.cleanOptions() } : {}),
      });
      this.reset();
      this.changed.emit();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add field', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      this.busy.set(false);
    }
  }

  async saveEdit(f: TmField) {
    try {
      await this.api.updateField(f.id, {
        name: this.draftName.trim() || f.name,
        ...(this.isSelect(f.type) ? { options: this.cleanOptions() } : {}),
      });
      this.editingId.set(null);
      this.reset();
      this.changed.emit();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save field', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  remove(f: TmField) {
    this.confirm.confirm({
      header: `Delete “${f.name}”?`,
      message: 'Values on every task in this project will be removed.',
      acceptLabel: 'Delete field',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-text p-button-secondary',
      accept: async () => {
        try {
          await this.api.deleteField(f.id);
          this.changed.emit();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete field', detail: err instanceof Error ? err.message : String(err) });
        }
      },
    });
  }
}
