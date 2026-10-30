import { Component, computed, inject, input, output, signal } from '@angular/core';
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
  type FormFieldDto,
  type FormFieldType,
  type FormProfile,
  type FormScoreGroup,
  type FormSectionDto,
} from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FieldOptionDraft, FieldOptionsEditorComponent } from '../field-options-editor/field-options-editor.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

type Field = FormFieldDto & { valueCount?: number };
type Section = FormSectionDto & { fields: Field[] };
/** What the builder edits: any form's sections and fields (valueCount = responses with the field filled in). */
export type BuilderForm = { id: string; sections: Section[] };

/**
 * The one form builder: sections and fields of any form. Changes save right away.
 * `profile` is a hard rule: the builder only offers what the form's profile allows (the API checks it too).
 * `apiBase` is the owning module's API (e.g. "/care"), which checks who may change the form.
 */
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
      <span class="font-medium mr-1">Sections <app-help-text key="form.builder.sections" /></span>
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
              @if (profile().required) {
                <th>Required</th>
              }
              <th>Options</th>
              @if (profile().scoring) {
                <th>Score area</th>
              }
              <th>Filled in on</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-f let-fi="rowIndex">
            <tr>
              <td><app-row-actions-menu [items]="fieldActions(s, f, fi)" ariaLabel="Field actions" /></td>
              <td>{{ f.name }}</td>
              <td>{{ typeLabel(f.type) }}</td>
              @if (profile().required) {
                <td>{{ f.required ? 'Yes' : '' }}</td>
              }
              <td>{{ optionLabels(f) }}</td>
              @if (profile().scoring) {
                <td>{{ groupName(f.scoreGroupId) }}</td>
              }
              <td>{{ f.valueCount ?? 0 }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td [attr.colspan]="5 + (profile().required ? 1 : 0) + (profile().scoring ? 1 : 0)">No fields yet.</td></tr>
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
        <label for="fbFieldType">Type <app-help-text key="form.builder.fieldType" /></label>
        <p-select
          inputId="fbFieldType"
          [options]="typeOptions()"
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
          <label>Options <app-help-text [key]="profile().scoring ? 'form.builder.optionsScored' : 'form.builder.options'" /></label>
          <app-field-options-editor [(options)]="fieldOptions" [points]="profile().scoring" />
        </div>
        @if (profile().scoring) {
          <div class="form-field mt-3">
            <label for="fbScoreGroup">Score area <app-help-text key="form.builder.scoreGroup" /></label>
            <p-select
              inputId="fbScoreGroup"
              [options]="scoreGroups()"
              optionLabel="name"
              optionValue="id"
              [(ngModel)]="fieldScoreGroupId"
              [showClear]="true"
              placeholder="None"
              styleClass="w-full"
              appendTo="body"
            />
          </div>
        }
      }
      @if (profile().required) {
        <div class="flex align-items-center gap-2 mt-3">
          <p-checkbox inputId="fbRequired" [binary]="true" [(ngModel)]="fieldRequired" />
          <label for="fbRequired">Required <app-help-text key="form.builder.required" /></label>
        </div>
      }
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

  form = input.required<BuilderForm>();
  profile = input.required<FormProfile>();
  /** The owning module's API, e.g. "/care". */
  apiBase = input.required<string>();
  /** Scored forms: the score areas fields can count toward (saved scoring settings). */
  scoreGroups = input<FormScoreGroup[]>([]);
  /** Something changed: the page reloads the form. */
  changed = output<void>();

  readonly typeOptions = computed(() =>
    this.profile().fieldTypes.map((value) => ({ value, label: FORM_FIELD_TYPE_LABELS[value] })),
  );

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
  fieldScoreGroupId: string | null = null;
  fieldOptions = signal<FieldOptionDraft[]>([]);

  typeLabel(type: FormFieldType) {
    return FORM_FIELD_TYPE_LABELS[type];
  }
  isSelect(type: FormFieldType) {
    return isSelectFieldType(type);
  }
  optionLabels(f: Field) {
    if (!isSelectFieldType(f.type)) return '';
    const scored = this.profile().scoring;
    return f.options.map((o) => (scored && typeof o.points === 'number' ? `${o.label} (${o.points})` : o.label)).join(', ');
  }
  groupName(id: string | null | undefined) {
    return id ? (this.scoreGroups().find((g) => g.id === id)?.name ?? '') : '';
  }

  sectionActions(s: Section, index: number): RowActionItem[] {
    const last = this.form().sections.length - 1;
    const items: RowActionItem[] = [{ id: 'edit', label: 'Rename', icon: 'pi pi-pencil', command: () => this.openEditSection(s) }];
    if (index > 0) items.push({ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`${this.apiBase()}/sections/${s.id}/move`, 'up') });
    if (index < last) items.push({ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`${this.apiBase()}/sections/${s.id}/move`, 'down') });
    items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteSection(s) });
    return items;
  }

  fieldActions(s: Section, f: Field, index: number): RowActionItem[] {
    const last = s.fields.length - 1;
    const items: RowActionItem[] = [{ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEditField(s, f) }];
    if (index > 0) items.push({ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`${this.apiBase()}/fields/${f.id}/move`, 'up') });
    if (index < last) items.push({ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`${this.apiBase()}/fields/${f.id}/move`, 'down') });
    items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteField(f) });
    return items;
  }

  async addSection() {
    const name = this.newSectionName.trim();
    if (!name) return;
    this.adding.set(true);
    try {
      await this.api.post(`${this.apiBase()}/forms/${this.form().id}/sections`, { name });
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
      await this.api.patch(`${this.apiBase()}/sections/${this.editingSection.id}`, { name: this.sectionName.trim() });
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
          await this.api.delete(`${this.apiBase()}/sections/${s.id}`);
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
    this.fieldType = this.profile().fieldTypes[0] ?? 'TEXT';
    this.fieldRequired = false;
    this.fieldScoreGroupId = null;
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
    this.fieldScoreGroupId = f.scoreGroupId ?? null;
    this.fieldOptions.set(f.options.map((o) => ({ ...o })));
    this.fieldVisible = true;
  }

  async saveField() {
    const name = this.fieldName.trim();
    if (!name) return;
    const options = isSelectFieldType(this.fieldType)
      ? this.fieldOptions()
          .filter((o) => o.label.trim())
          .map((o) => ({
            ...(o.id ? { id: o.id } : {}),
            label: o.label.trim(),
            ...(this.profile().scoring && typeof o.points === 'number' ? { points: o.points } : {}),
          }))
      : undefined;
    const body = {
      name,
      ...(this.profile().required ? { required: this.fieldRequired } : {}),
      ...(this.profile().scoring ? { scoreGroupId: this.fieldScoreGroupId } : {}),
      ...(options ? { options } : {}),
    };
    this.saving.set(true);
    try {
      if (this.editingField) {
        await this.api.patch(`${this.apiBase()}/fields/${this.editingField.id}`, body);
      } else if (this.fieldSection) {
        await this.api.post(`${this.apiBase()}/sections/${this.fieldSection.id}/fields`, { ...body, type: this.fieldType });
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
          await this.api.delete(`${this.apiBase()}/fields/${f.id}`);
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
