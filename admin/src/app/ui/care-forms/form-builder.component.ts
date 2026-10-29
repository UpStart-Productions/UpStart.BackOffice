import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import {
  FORM_FIELD_TYPE_LABELS,
  isSelectFieldType,
  type CareFormDto,
  type FormFieldDto,
  type FormFieldType,
} from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FieldOptionDraft, FieldOptionsEditorComponent } from '../field-options-editor/field-options-editor.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

type Section = CareFormDto['sections'][number];
type Field = FormFieldDto & { valueCount?: number };

/** Sections and fields of a Care form (Care → Forms → a form). Changes save right away. */
@Component({
  selector: 'app-form-builder',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    SelectModule,
    TableModule,
    AppDialogModule,
    FieldOptionsEditorComponent,
    HelpTextComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <div class="field-action-row toolbar">
      <span class="font-medium mr-1">Sections <app-help-text key="care.form.sections" /></span>
      <input
        pInputText
        [(ngModel)]="newSectionName"
        placeholder="New section name"
        class="flex-1"
        aria-label="New section name"
        (keydown.enter)="addSection()"
      />
      <p-button label="Add" icon="pi pi-plus" size="small" [loading]="adding()" [disabled]="!newSectionName.trim()" (onClick)="addSection()" />
    </div>

    @for (s of form().sections; track s.id; let i = $index) {
      <div class="fb-section">
        <div class="fb-section-header">
          <app-row-actions-menu [items]="sectionActions(s, i)" ariaLabel="Section actions" />
          <span class="fb-section-name">{{ s.name }}</span>
          <span class="flex-1"></span>
          <p-button label="Add field" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openNewField(s)" />
        </div>
        <p-table [value]="s.fields" styleClass="table-bordered">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>Field</th>
              <th>Type</th>
              <th>Required</th>
              <th>Options</th>
              <th>Filled in on</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-f let-fi="rowIndex">
            <tr>
              <td><app-row-actions-menu [items]="fieldActions(s, f, fi)" ariaLabel="Field actions" /></td>
              <td>{{ f.name }}</td>
              <td>{{ typeLabel(f.type) }}</td>
              <td>{{ f.required ? 'Yes' : '' }}</td>
              <td>{{ optionLabels(f) }}</td>
              <td>{{ f.valueCount ?? 0 }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6">No fields yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    } @empty {
      <p class="mt-3 mb-0">No sections yet. Add one, then add fields to it.</p>
    }

    <p-dialog header="Rename section" [(visible)]="sectionVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
      <div class="form-field">
        <label for="fbSectionName">Name</label>
        <input pInputText id="fbSectionName" class="w-full" [(ngModel)]="sectionName" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="sectionVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!sectionName.trim()" (onClick)="saveSection()" />
      </ng-template>
    </p-dialog>

    <p-dialog [header]="editingField ? 'Edit field' : 'Add field'" [(visible)]="fieldVisible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      <div class="form-field">
        <label for="fbFieldName">Name</label>
        <input pInputText id="fbFieldName" class="w-full" [(ngModel)]="fieldName" />
      </div>
      <div class="form-field mt-3">
        <label for="fbFieldType">Type <app-help-text key="care.form.fieldType" /></label>
        <p-select
          inputId="fbFieldType"
          [options]="typeOptions"
          optionLabel="label"
          optionValue="value"
          [(ngModel)]="fieldType"
          [disabled]="!!editingField"
          styleClass="w-full"
          appendTo="body"
        />
      </div>
      @if (isSelect(fieldType)) {
        <div class="form-field mt-3">
          <label>Options <app-help-text key="care.form.options" /></label>
          <app-field-options-editor [(options)]="fieldOptions" />
        </div>
      }
      <div class="flex align-items-center gap-2 mt-3">
        <p-checkbox inputId="fbRequired" [binary]="true" [(ngModel)]="fieldRequired" />
        <label for="fbRequired">Required <app-help-text key="care.form.required" /></label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="fieldVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!fieldName.trim()" (onClick)="saveField()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .toolbar input {
      min-width: 12rem;
      max-width: 20rem;
    }
    .fb-section {
      margin-top: 1.5rem;
    }
    .fb-section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .fb-section-name {
      font-weight: 600;
    }
  `,
})
export class FormBuilderComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  form = input.required<CareFormDto>();
  /** Something changed: the page reloads the form. */
  changed = output<void>();

  readonly typeOptions = (Object.keys(FORM_FIELD_TYPE_LABELS) as FormFieldType[]).map((value) => ({
    value,
    label: FORM_FIELD_TYPE_LABELS[value],
  }));

  adding = signal(false);
  saving = signal(false);
  newSectionName = '';

  sectionVisible = false;
  editingSection: Section | null = null;
  sectionName = '';

  fieldVisible = false;
  fieldSection: Section | null = null;
  editingField: Field | null = null;
  fieldName = '';
  fieldType: FormFieldType = 'TEXT';
  fieldRequired = false;
  fieldOptions = signal<FieldOptionDraft[]>([]);

  typeLabel(type: FormFieldType) {
    return FORM_FIELD_TYPE_LABELS[type];
  }
  isSelect(type: FormFieldType) {
    return isSelectFieldType(type);
  }
  optionLabels(f: Field) {
    return isSelectFieldType(f.type) ? f.options.map((o) => o.label).join(', ') : '';
  }

  sectionActions(s: Section, index: number): RowActionItem[] {
    const last = this.form().sections.length - 1;
    const items: RowActionItem[] = [{ id: 'edit', label: 'Rename', icon: 'pi pi-pencil', command: () => this.openEditSection(s) }];
    if (index > 0) items.push({ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`/care/sections/${s.id}/move`, 'up') });
    if (index < last) items.push({ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`/care/sections/${s.id}/move`, 'down') });
    items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteSection(s) });
    return items;
  }

  fieldActions(s: Section, f: Field, index: number): RowActionItem[] {
    const last = s.fields.length - 1;
    const items: RowActionItem[] = [{ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEditField(s, f) }];
    if (index > 0) items.push({ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`/care/fields/${f.id}/move`, 'up') });
    if (index < last) items.push({ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`/care/fields/${f.id}/move`, 'down') });
    items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteField(f) });
    return items;
  }

  async addSection() {
    const name = this.newSectionName.trim();
    if (!name) return;
    this.adding.set(true);
    try {
      await this.api.post(`/care/forms/${this.form().id}/sections`, { name });
      this.newSectionName = '';
      this.changed.emit();
    } catch (err) {
      this.fail('Could not add section', err);
    } finally {
      this.adding.set(false);
    }
  }

  openEditSection(s: Section) {
    this.editingSection = s;
    this.sectionName = s.name;
    this.sectionVisible = true;
  }

  async saveSection() {
    if (!this.editingSection) return;
    this.saving.set(true);
    try {
      await this.api.patch(`/care/sections/${this.editingSection.id}`, { name: this.sectionName.trim() });
      this.sectionVisible = false;
      this.changed.emit();
    } catch (err) {
      this.fail('Could not save section', err);
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteSection(s: Section) {
    const count = s.fields.length;
    this.confirmDelete.confirm({
      message: count
        ? `Delete "${s.name}"? Its ${count} ${count === 1 ? 'field' : 'fields'} and their answers on every record are removed. This cannot be undone.`
        : `Delete "${s.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/care/sections/${s.id}`);
          this.changed.emit();
        } catch (err) {
          this.fail('Could not delete section', err);
        }
      },
    });
  }

  openNewField(s: Section) {
    this.fieldSection = s;
    this.editingField = null;
    this.fieldName = '';
    this.fieldType = 'TEXT';
    this.fieldRequired = false;
    this.fieldOptions.set([
      { id: '', label: '' },
      { id: '', label: '' },
    ]);
    this.fieldVisible = true;
  }

  openEditField(s: Section, f: Field) {
    this.fieldSection = s;
    this.editingField = f;
    this.fieldName = f.name;
    this.fieldType = f.type;
    this.fieldRequired = f.required;
    this.fieldOptions.set(f.options.map((o) => ({ ...o })));
    this.fieldVisible = true;
  }

  async saveField() {
    const name = this.fieldName.trim();
    if (!name) return;
    const options = isSelectFieldType(this.fieldType)
      ? this.fieldOptions()
          .filter((o) => o.label.trim())
          .map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim() }))
      : undefined;
    const body = { name, required: this.fieldRequired, ...(options ? { options } : {}) };
    this.saving.set(true);
    try {
      if (this.editingField) {
        await this.api.patch(`/care/fields/${this.editingField.id}`, body);
      } else if (this.fieldSection) {
        await this.api.post(`/care/sections/${this.fieldSection.id}/fields`, { ...body, type: this.fieldType });
      }
      this.fieldVisible = false;
      this.changed.emit();
    } catch (err) {
      this.fail('Could not save field', err);
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteField(f: Field) {
    const n = f.valueCount ?? 0;
    this.confirmDelete.confirm({
      message: n
        ? `Delete "${f.name}"? It is filled in on ${n} ${n === 1 ? 'record' : 'records'}, and those answers are removed. This cannot be undone.`
        : `Delete "${f.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/care/fields/${f.id}`);
          this.changed.emit();
        } catch (err) {
          this.fail('Could not delete field', err);
        }
      },
    });
  }

  private async move(path: string, direction: 'up' | 'down') {
    try {
      await this.api.post(path, { direction });
      this.changed.emit();
    } catch (err) {
      this.fail('Could not move', err);
    }
  }

  private fail(summary: string, err: unknown) {
    this.toast.add({ severity: 'error', summary, detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
  }
}
