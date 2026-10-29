import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FieldOptionDraft, FieldOptionsEditorComponent } from '../field-options-editor/field-options-editor.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';
import {
  CLIENT_FIELD_TYPE_LABELS,
  ClientFieldSectionSetup,
  ClientFieldSetup,
  ClientFieldType,
  isSelectType,
} from './client-fields.types';

/** Settings → Client fields: sections and fields shown on every organization page. Admins only. */
@Component({
  selector: 'app-client-fields-settings',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TableModule,
    TagModule,
    AppDialogModule,
    FieldOptionsEditorComponent,
    HelpTextComponent,
    RowActionsMenuComponent,
  ],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    }

    <div class="field-action-row toolbar">
      <span class="font-medium mr-1">Sections <app-help-text key="settings.clientFields.sections" /></span>
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

    @for (s of sections(); track s.id; let i = $index) {
      <div class="cf-section">
        <div class="cf-section-header">
          <app-row-actions-menu [items]="sectionActions(s, i)" ariaLabel="Section actions" />
          <span class="cf-section-name">{{ s.name }}</span>
          @if (s.sensitive) {
            <p-tag value="Sensitive" severity="warn" icon="pi pi-lock" />
          }
          <span class="flex-1"></span>
          <p-button label="Add field" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openNewField(s)" />
        </div>
        <p-table [value]="s.fields" styleClass="table-bordered">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>Field</th>
              <th>Type</th>
              <th>Options</th>
              <th>Filled in on</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-f let-fi="rowIndex">
            <tr>
              <td><app-row-actions-menu [items]="fieldActions(s, f, fi)" ariaLabel="Field actions" /></td>
              <td>{{ f.name }}</td>
              <td>{{ typeLabel(f.type) }}</td>
              <td>{{ optionLabels(f) }}</td>
              <td>{{ f.valueCount }} {{ f.valueCount === 1 ? 'organization' : 'organizations' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="5">No fields yet.</td></tr>
          </ng-template>
        </p-table>
      </div>
    } @empty {
      @if (!loading()) {
        <p class="mt-3 mb-0">No sections yet.</p>
      }
    }

    <p-dialog [header]="editingSection ? 'Edit section' : 'Add section'" [(visible)]="sectionVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
      <div class="form-field">
        <label for="cfSectionName">Name</label>
        <input pInputText id="cfSectionName" class="w-full" [(ngModel)]="sectionName" />
      </div>
      <div class="flex align-items-center gap-2 mt-3">
        <p-checkbox inputId="cfSensitive" [binary]="true" [(ngModel)]="sectionSensitive" />
        <label for="cfSensitive">Sensitive <app-help-text key="settings.clientFields.sensitive" /></label>
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="sectionVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!sectionName.trim()" (onClick)="saveSection()" />
      </ng-template>
    </p-dialog>

    <p-dialog [header]="editingField ? 'Edit field' : 'Add field'" [(visible)]="fieldVisible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      <div class="form-field">
        <label for="cfFieldName">Name</label>
        <input pInputText id="cfFieldName" class="w-full" [(ngModel)]="fieldName" />
      </div>
      <div class="form-field mt-3">
        <label for="cfFieldType">Type <app-help-text key="settings.clientFields.type" /></label>
        <p-select
          inputId="cfFieldType"
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
          <label>Options <app-help-text key="settings.clientFields.options" /></label>
          <app-field-options-editor [(options)]="fieldOptions" />
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
    .cf-section {
      margin-top: 1.5rem;
    }
    .cf-section-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }
    .cf-section-name {
      font-weight: 600;
    }
  `,
})
export class ClientFieldsSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  readonly typeOptions = (Object.keys(CLIENT_FIELD_TYPE_LABELS) as ClientFieldType[]).map((value) => ({
    value,
    label: CLIENT_FIELD_TYPE_LABELS[value],
  }));

  sections = signal<ClientFieldSectionSetup[]>([]);
  loading = signal(true);
  adding = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  newSectionName = '';

  sectionVisible = false;
  editingSection: ClientFieldSectionSetup | null = null;
  sectionName = '';
  sectionSensitive = false;

  fieldVisible = false;
  fieldSection: ClientFieldSectionSetup | null = null;
  editingField: ClientFieldSetup | null = null;
  fieldName = '';
  fieldType: ClientFieldType = 'TEXT';
  fieldOptions = signal<FieldOptionDraft[]>([]);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.sections.set(await this.api.get<ClientFieldSectionSetup[]>('/client-fields'));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load client fields');
    } finally {
      this.loading.set(false);
    }
  }

  typeLabel(type: ClientFieldType) {
    return CLIENT_FIELD_TYPE_LABELS[type];
  }
  isSelect(type: ClientFieldType) {
    return isSelectType(type);
  }
  optionLabels(f: ClientFieldSetup) {
    return isSelectType(f.type) ? f.options.map((o) => o.label).join(', ') : '—';
  }

  sectionActions(s: ClientFieldSectionSetup, index: number): RowActionItem[] {
    const last = this.sections().length - 1;
    return [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEditSection(s) },
      ...(index > 0 ? [{ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`/client-fields/sections/${s.id}/move`, 'up') }] : []),
      ...(index < last ? [{ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`/client-fields/sections/${s.id}/move`, 'down') }] : []),
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteSection(s) },
    ];
  }

  fieldActions(s: ClientFieldSectionSetup, f: ClientFieldSetup, index: number): RowActionItem[] {
    const last = s.fields.length - 1;
    return [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEditField(s, f) },
      ...(index > 0 ? [{ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`/client-fields/fields/${f.id}/move`, 'up') }] : []),
      ...(index < last ? [{ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`/client-fields/fields/${f.id}/move`, 'down') }] : []),
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteField(f) },
    ];
  }

  async addSection() {
    const name = this.newSectionName.trim();
    if (!name) return;
    this.adding.set(true);
    try {
      await this.api.post('/client-fields/sections', { name });
      this.newSectionName = '';
      await this.load();
    } catch (err) {
      this.fail('Could not add section', err);
    } finally {
      this.adding.set(false);
    }
  }

  openEditSection(s: ClientFieldSectionSetup) {
    this.editingSection = s;
    this.sectionName = s.name;
    this.sectionSensitive = s.sensitive;
    this.sectionVisible = true;
  }

  async saveSection() {
    if (!this.editingSection) return;
    this.saving.set(true);
    try {
      await this.api.patch(`/client-fields/sections/${this.editingSection.id}`, {
        name: this.sectionName.trim(),
        sensitive: this.sectionSensitive,
      });
      this.sectionVisible = false;
      await this.load();
    } catch (err) {
      this.fail('Could not save section', err);
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteSection(s: ClientFieldSectionSetup) {
    const count = s.fields.length;
    this.confirmDelete.confirm({
      message: count
        ? `Delete "${s.name}"? Its ${count} ${count === 1 ? 'field' : 'fields'} and everything filled in on organizations are removed. This cannot be undone.`
        : `Delete "${s.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/client-fields/sections/${s.id}`);
          await this.load();
        } catch (err) {
          this.fail('Could not delete section', err);
        }
      },
    });
  }

  openNewField(s: ClientFieldSectionSetup) {
    this.fieldSection = s;
    this.editingField = null;
    this.fieldName = '';
    this.fieldType = 'TEXT';
    this.fieldOptions.set([
      { id: '', label: '' },
      { id: '', label: '' },
    ]);
    this.fieldVisible = true;
  }

  openEditField(s: ClientFieldSectionSetup, f: ClientFieldSetup) {
    this.fieldSection = s;
    this.editingField = f;
    this.fieldName = f.name;
    this.fieldType = f.type;
    this.fieldOptions.set(f.options.map((o) => ({ ...o })));
    this.fieldVisible = true;
  }

  async saveField() {
    const name = this.fieldName.trim();
    if (!name) return;
    const options = isSelectType(this.fieldType)
      ? this.fieldOptions()
          .filter((o) => o.label.trim())
          .map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim() }))
      : undefined;
    this.saving.set(true);
    try {
      if (this.editingField) {
        await this.api.patch(`/client-fields/fields/${this.editingField.id}`, { name, ...(options ? { options } : {}) });
      } else if (this.fieldSection) {
        await this.api.post(`/client-fields/sections/${this.fieldSection.id}/fields`, { name, type: this.fieldType, ...(options ? { options } : {}) });
      }
      this.fieldVisible = false;
      await this.load();
    } catch (err) {
      this.fail('Could not save field', err);
    } finally {
      this.saving.set(false);
    }
  }

  confirmDeleteField(f: ClientFieldSetup) {
    this.confirmDelete.confirm({
      message: f.valueCount
        ? `Delete "${f.name}"? It is filled in on ${f.valueCount} ${f.valueCount === 1 ? 'organization' : 'organizations'}, and those values are removed. This cannot be undone.`
        : `Delete "${f.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/client-fields/fields/${f.id}`);
          await this.load();
        } catch (err) {
          this.fail('Could not delete field', err);
        }
      },
    });
  }

  private async move(path: string, direction: 'up' | 'down') {
    try {
      await this.api.post(path, { direction });
      await this.load();
    } catch (err) {
      this.fail('Could not move', err);
    }
  }

  private fail(summary: string, err: unknown) {
    this.toast.add({ severity: 'error', summary, detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
  }
}
