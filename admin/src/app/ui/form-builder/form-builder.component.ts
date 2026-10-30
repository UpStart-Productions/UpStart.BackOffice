import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDragPlaceholder, CdkDragPreview, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import {
  FORM_FIELD_TYPE_ICONS,
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
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { HelpTextComponent } from '../help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

type Field = FormFieldDto;
type Section = FormSectionDto & { fields: Field[] };
/** What the builder edits: any form's sections and fields. */
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
    TextareaModule,
    TooltipModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPreview,
    CdkDragPlaceholder,
    AppDialogModule,
    FieldOptionsEditorComponent,
    HelpTextComponent,
    LucideIconComponent,
    RowActionsMenuComponent,
  ],
  template: `
    @if (!sectionId()) {
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
    }

    @for (s of shownSections(); track s.id) {
      <div class="fb-section" [class.fb-section--single]="!!sectionId()">
        <div class="fb-section-header">
          <app-row-actions-menu [items]="sectionActions(s, indexOf(s))" ariaLabel="Section actions" />
          <span class="fb-section-name">{{ s.name }}</span>
          <span class="flex-1"></span>
          <p-button label="Add field" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openNewField(s)" />
        </div>
        @if (s.description) {
          <p class="fb-section-intro">{{ s.description }}</p>
        }
        <div class="fb-fields" cdkDropList cdkDropListLockAxis="y" [cdkDropListData]="s" (cdkDropListDropped)="dropField($event)">
          @for (f of s.fields; track f.id) {
            <div class="fb-field" cdkDrag [cdkDragData]="f">
              <span class="fb-cell-actions">
                <span class="fb-drag-handle" cdkDragHandle title="Drag to reorder" aria-hidden="true"><i class="pi pi-bars"></i></span>
                <app-row-actions-menu [items]="fieldActions(s, f)" ariaLabel="Field actions" />
              </span>
              <div class="fb-field-body">
                <div class="fb-field-name">{{ f.name }}</div>
                <div class="fb-field-meta">
                  @if (profile().required) {
                    <span
                      class="fb-required"
                      [class.fb-required--on]="f.required"
                      [pTooltip]="f.required ? 'Required' : 'Optional'"
                      tooltipPosition="top"
                      [attr.aria-label]="f.required ? 'Required' : 'Optional'"
                    ><i class="pi" [class.pi-circle-fill]="f.required" [class.pi-circle]="!f.required" aria-hidden="true"></i></span>
                  }
                  <span class="fb-chip"><nmp-lucide-icon [name]="typeIcon(f.type)" aria-hidden="true" /> {{ typeLabel(f.type) }}</span>
                  <!-- The score area, only when it isn't the section's own name (that's already in the header). -->
                  @if (profile().scoring && groupName(f.scoreGroupId); as g) {
                    @if (g !== s.name) {
                      <span class="fb-chip"><i class="pi pi-chart-bar" aria-hidden="true"></i> {{ g }}</span>
                    }
                  }
                </div>
                @if (isSelect(f.type) && f.options.length) {
                  <div class="fb-field-options">
                    @for (o of f.options; track o.id) {
                      @let pts = profile().scoring && o.points !== undefined && o.points !== null ? o.points : null;
                      <span class="fb-option" [title]="pts !== null ? o.label + ' (' + pts + ')' : o.label">
                        <span class="fb-option-label">{{ o.label }}</span>
                        @if (pts !== null) {
                          <span class="fb-option-points">{{ pts }}</span>
                        }
                      </span>
                    }
                  </div>
                }
              </div>
              <div class="fb-drag-preview" *cdkDragPreview><i class="pi pi-bars"></i> {{ f.name }}</div>
              <div class="fb-drop-slot" *cdkDragPlaceholder></div>
            </div>
          } @empty {
            <p class="fb-empty">No fields yet.</p>
          }
        </div>
      </div>
    } @empty {
      <p class="mt-3 mb-0">No sections yet. Add one, then add fields to it.</p>
    }

    <p-dialog header="Edit section" [(visible)]="sectionVisible" [modal]="true" [style]="{ width: 'min(32rem, 96vw)' }">
      <div class="form-field">
        <label for="fbSectionName">Name</label>
        <input pInputText id="fbSectionName" class="w-full" [(ngModel)]="sectionName" />
      </div>
      <div class="form-field mt-3">
        <label for="fbSectionIntro">Intro (optional) <app-help-text key="form.builder.sectionIntro" /></label>
        <textarea pTextarea id="fbSectionIntro" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="sectionIntro"></textarea>
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
        >
          <ng-template pTemplate="selectedItem" let-o>
            @if (o) {
              <span class="fb-type-option"><nmp-lucide-icon [name]="typeIcon(o.value)" aria-hidden="true" />{{ o.label }}</span>
            }
          </ng-template>
          <ng-template pTemplate="item" let-o>
            <span class="fb-type-option"><nmp-lucide-icon [name]="typeIcon(o.value)" aria-hidden="true" />{{ o.label }}</span>
          </ng-template>
        </p-select>
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
    .fb-cell-actions {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .fb-drag-handle {
      cursor: grab;
      color: var(--drag-handle-color);
      padding: 0 0.15rem;
    }
    /* Questions: one compact block each (name, then type/required/area chips, then choices). */
    /* In a card the list runs edge to edge (rows keep the card's 2rem inset), with a line between rows. */
    .fb-fields {
      --fb-inset: 0;
    }
    :host-context(.card) .fb-fields {
      --fb-inset: 2rem;
      margin: 0 calc(-1 * var(--fb-inset));
    }
    .fb-field {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.6rem var(--fb-inset);
      background: var(--surface-card);
      border-top: 1px solid var(--surface-border);
    }
    .fb-field:last-child {
      border-bottom: 1px solid var(--surface-border);
    }
    .fb-field:hover {
      background: var(--surface-hover, var(--surface-50));
    }
    .fb-field .fb-cell-actions {
      padding-top: 0.05rem;
    }
    .fb-field-body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.3rem;
    }
    .fb-field-name {
      font-weight: 500;
      line-height: 1.4;
    }
    .fb-field-meta,
    .fb-field-options {
      display: flex;
      flex-wrap: wrap;
      gap: 0.3rem;
    }
    .fb-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.05rem 0.5rem;
      border-radius: 999px;
      background: var(--surface-100);
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
    .fb-chip .pi {
      font-size: 0.7rem;
    }
    .fb-option {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      max-width: 18rem;
      padding: 0.05rem 0.5rem;
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      font-size: var(--fs-sm);
      line-height: 1.5;
    }
    .fb-option-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fb-option-points {
      flex-shrink: 0;
      color: var(--text-color-secondary);
      font-variant-numeric: tabular-nums;
    }
    .fb-option-points::before {
      content: '';
      display: inline-block;
      width: 1px;
      height: 0.8em;
      margin-right: 0.35rem;
      background: var(--surface-border);
      vertical-align: middle;
    }
    /* Required: a red filled dot; optional: an open dot. Name on hover. */
    .fb-required {
      display: inline-flex;
      align-items: center;
      padding: 0 0.15rem;
      color: var(--text-color-secondary);
      cursor: default;
    }
    .fb-required .pi {
      font-size: 0.7rem;
    }
    .fb-required--on {
      color: var(--color-severity-danger-text, #dc2626);
    }
    .fb-type-option {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .fb-type-option nmp-lucide-icon {
      color: var(--text-color-secondary);
    }
    .fb-chip nmp-lucide-icon {
      font-size: 0.85rem;
    }
    .fb-empty {
      margin: 0;
      padding: 0.75rem var(--fb-inset);
      color: var(--text-color-secondary);
    }
    /* The drop slot while dragging a question: same look as a task row's drop slot in Tasks. */
    .fb-drop-slot {
      min-height: 3rem;
      background: color-mix(in srgb, var(--brand-primary) 9%, transparent);
      border-top: 1px dashed var(--brand-primary);
      border-bottom: 1px dashed var(--brand-primary);
    }
    .cdk-drop-list-dragging .fb-field:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .fb-drag-preview {
      padding: 0.5rem 0.75rem;
      background: var(--surface-card);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
      max-width: 32rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fb-section--single {
      margin-top: 0;
    }
    .fb-section-intro {
      margin: 0 0 0.75rem;
      color: var(--text-color-secondary);
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
  /** Show only this section, without the add-section bar (the form workspace picks sections in its sidebar). */
  sectionId = input<string | null>(null);
  /** Something changed: the page reloads the form. */
  changed = output<void>();

  readonly shownSections = computed(() => {
    const id = this.sectionId();
    return id ? this.form().sections.filter((s) => s.id === id) : this.form().sections;
  });

  indexOf(s: Section) {
    return this.form().sections.findIndex((x) => x.id === s.id);
  }

  readonly typeOptions = computed(() =>
    this.profile().fieldTypes.map((value) => ({ value, label: FORM_FIELD_TYPE_LABELS[value] })),
  );

  adding = signal(false);
  saving = signal(false);
  newSectionName = '';

  sectionVisible = false;
  editingSection: Section | null = null;
  sectionName = '';
  sectionIntro = '';

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
  typeIcon(type: FormFieldType) {
    return FORM_FIELD_TYPE_ICONS[type];
  }
  isSelect(type: FormFieldType) {
    return isSelectFieldType(type);
  }
  groupName(id: string | null | undefined) {
    return id ? (this.scoreGroups().find((g) => g.id === id)?.name ?? '') : '';
  }

  sectionActions(s: Section, index: number): RowActionItem[] {
    const last = this.form().sections.length - 1;
    const items: RowActionItem[] = [{ id: 'edit', label: 'Edit section', icon: 'pi pi-pencil', command: () => this.openEditSection(s) }];
    // In the form workspace, sections are reordered by dragging them in the left column.
    if (!this.sectionId()) {
      if (index > 0) items.push({ id: 'up', label: 'Move up', icon: 'pi pi-arrow-up', command: () => void this.move(`${this.apiBase()}/sections/${s.id}/move`, 'up') });
      if (index < last) items.push({ id: 'down', label: 'Move down', icon: 'pi pi-arrow-down', command: () => void this.move(`${this.apiBase()}/sections/${s.id}/move`, 'down') });
    }
    items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteSection(s) });
    return items;
  }

  fieldActions(s: Section, f: Field): RowActionItem[] {
    const items: RowActionItem[] = [{ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEditField(s, f) }];
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
    this.sectionIntro = s.description ?? '';
    this.sectionVisible = true;
  }

  async saveSection() {
    if (!this.editingSection) return;
    this.saving.set(true);
    try {
      await this.api.patch(`${this.apiBase()}/sections/${this.editingSection.id}`, {
        name: this.sectionName.trim(),
        description: this.sectionIntro.trim() || null,
      });
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
    this.confirmDelete.confirm({
      message: `Delete "${f.name}"? Any answers to it are removed too. This cannot be undone.`,
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

  /** Drag and drop of a question within its section (☰ handle, like Tasks). Shows the new order right away. */
  async dropField(event: CdkDragDrop<Section>) {
    const s = event.container.data;
    if (event.previousIndex === event.currentIndex) return;
    moveItemInArray(s.fields, event.previousIndex, event.currentIndex);
    try {
      await this.api.post(`${this.apiBase()}/sections/${s.id}/fields/order`, { ids: s.fields.map((f) => f.id) });
      this.changed.emit();
    } catch (err) {
      this.fail('Could not reorder', err);
      this.changed.emit();
    }
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
