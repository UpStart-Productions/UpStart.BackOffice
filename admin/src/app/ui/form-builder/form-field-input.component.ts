import { Component, computed, input, model, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import {
  FORM_FILE_ACCEPT,
  FORM_FILE_MAX_BYTES,
  FORM_FILE_MAX_COUNT,
  FORM_GROUP_MAX_ROWS,
  formatFileSize,
  subfieldAsField,
  type FormFieldDto,
  type FormFileRef,
  type FormGroupRow,
} from '@upstart/back-office/shared';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { DateInputComponent } from '../date-input/date-input.component';
import { MoneyInputComponent } from '../money-input/money-input.component';
import { PhoneInputComponent } from '../phone-input/phone-input.component';
import { SsnInputComponent } from '../ssn-input/ssn-input.component';
import { SingleFileDropzoneComponent } from '../single-file-dropzone/single-file-dropzone.component';

/** Uploads one file for a file question and returns its reference (staff or public API, by page). */
export type FormFileUploader = (file: File) => Promise<FormFileRef>;
/** Opens or downloads an uploaded file (signed-in pages only). */
export type FormFileOpener = (ref: FormFileRef) => void;

/**
 * The one control for a form field (label + input by type). Used on the record page in the
 * back office and on the public form page. `value` is the stored shape: string, number, YYYY-MM-DD,
 * option id, option ids, true, or (repeating groups) a list of rows, each sub-field id -> value.
 * A repeating group renders this same control for each sub-field of each row.
 */
@Component({
  selector: 'app-form-field-input',
  standalone: true,
  host: { class: 'form-field' },
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
    DateInputComponent,
    MoneyInputComponent,
    PhoneInputComponent,
    SsnInputComponent,
    SingleFileDropzoneComponent,
  ],
  template: `
    @let f = field();
    @let id = 'ff-' + idPrefix() + f.id;
    @if (f.type === 'CONTENT') {
      <!-- A text block: formatted text, no input. -->
      <div class="ff-text" [innerHTML]="f.name"></div>
    } @else if (f.type === 'FILE') {
      <!-- A file upload: the uploaded files, then a drop zone (Word, PDF, Excel, PNG, JPG). -->
      <span class="ff-legend" [id]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="ff-required">*</span>}</span>
      <div class="ff-files">
        @for (file of files(); track file.key) {
          <div class="ff-file">
            <i class="pi pi-paperclip" aria-hidden="true"></i>
            @if (fileOpen()) {
              <button type="button" class="ff-file-name ff-file-link" (click)="openFile(file)">{{ file.name }}</button>
            } @else {
              <span class="ff-file-name">{{ file.name }}</span>
            }
            <span class="ff-file-size">{{ size(file.size) }}</span>
            @if (!disabled()) {
              <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" [ariaLabel]="'Delete ' + file.name" (onClick)="removeFile(file)" />
            }
          </div>
        } @empty {
          @if (disabled()) {
            <p class="ff-group-empty">None</p>
          }
        }
        @if (!disabled() && canAddFile()) {
            <app-single-file-dropzone
              #fileDrop
              [accept]="fileAccept"
              [maxBytes]="fileMaxBytes"
              [multiple]="!!f.multiple"
              [fill]="true"
              [emptyTitle]="f.multiple ? 'Files' : 'File'"
              emptyHint="Drop a Word, PDF, Excel, PNG or JPG file, or click to browse"
              selectedTitle="Uploading"
              emptyIcon="pi-paperclip"
              (fileChange)="uploadFiles($event ? [$event] : [])"
              (filesChange)="uploadFiles($event)"
              (invalidFile)="fileError.set($event)"
            />
        }
        @if (uploading()) {
          <p class="ff-group-empty"><i class="pi pi-spin pi-spinner mr-2" aria-hidden="true"></i>Uploading…</p>
        }
        @if (fileError(); as err) {
          <p class="ff-file-error">{{ err }}</p>
        }
      </div>
    } @else if (f.type === 'GROUP') {
      <!-- A repeating group: a row of sub-fields per entry, Add another adds one. -->
      <span class="ff-legend" [id]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="required-dot" aria-hidden="true"></span>}</span>
      <div class="ff-group" role="group" [attr.aria-labelledby]="id">
        @for (row of shownRows(); track $index; let i = $index) {
          <div class="ff-group-row">
            <div class="ff-group-cells">
              @for (sf of subfields(); track sf.id) {
                <app-form-field-input
                  class="ff-group-cell"
                  [class.ff-group-cell--wide]="sf.type === 'LONG_TEXT'"
                  [field]="sf"
                  [idPrefix]="idPrefix() + f.id + '-' + i + '-'"
                  [value]="row[sf.id] ?? null"
                  (valueChange)="setCell(i, sf.id, $event)"
                  [disabled]="disabled()"
                />
              }
            </div>
            @if (!disabled() && (shownRows().length > 1 || hasData(row))) {
              <p-button icon="pi pi-trash" [text]="true" severity="danger" size="small" [ariaLabel]="'Delete row ' + (i + 1)" (onClick)="removeRow(i)" />
            }
          </div>
        } @empty {
          @if (disabled()) {
            <p class="ff-group-empty">None</p>
          }
        }
        @if (!disabled() && shownRows().length < maxRows) {
          <div>
            <p-button label="Add another" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="addRow()" />
          </div>
        }
      </div>
    } @else if (choices() && (f.type === 'SINGLE_SELECT' || f.type === 'MULTI_SELECT')) {
      <!-- Choices as a list to click (public pages), instead of a dropdown. -->
      <span class="ff-legend" [id]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="required-dot" aria-hidden="true"></span>}</span>
      <div class="ff-choices" [attr.role]="f.type === 'SINGLE_SELECT' ? 'radiogroup' : 'group'" [attr.aria-labelledby]="id">
        @for (o of f.options; track o.id) {
          @let on = isPicked(o.id);
          <button
            type="button"
            class="ff-choice"
            [class.ff-choice--on]="on"
            [attr.role]="f.type === 'SINGLE_SELECT' ? 'radio' : 'checkbox'"
            [attr.aria-checked]="on"
            [disabled]="disabled()"
            (click)="pick(o.id)"
          >
            <i class="pi" [class.pi-circle]="!on && f.type === 'SINGLE_SELECT'" [class.pi-circle-fill]="on && f.type === 'SINGLE_SELECT'" [class.pi-stop]="!on && f.type === 'MULTI_SELECT'" [class.pi-check-square]="on && f.type === 'MULTI_SELECT'" aria-hidden="true"></i>
            <span>{{ o.label }}</span>
          </button>
        }
      </div>
    } @else if (f.type === 'CHECKBOX') {
      <div class="ff-checkbox">
        <p-checkbox [inputId]="id" [binary]="true" [ngModel]="value() === true" (ngModelChange)="value.set($event ? true : null)" [disabled]="disabled()" />
        <label [for]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="required-dot" aria-hidden="true"></span>}</label>
      </div>
    } @else {
      <label [for]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="required-dot" aria-hidden="true"></span>}</label>
      @switch (f.type) {
        @case ('LONG_TEXT') {
          <textarea pTextarea [id]="id" class="w-full" rows="3" [autoResize]="true" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event)" [disabled]="disabled()"></textarea>
        }
        @case ('NUMBER') {
          <p-inputNumber
            [inputId]="id"
            [ngModel]="value() ?? null"
            (ngModelChange)="value.set($event)"
            [useGrouping]="false"
            [maxFractionDigits]="4"
            styleClass="w-full"
            inputStyleClass="w-full"
            [disabled]="disabled()"
          />
        }
        @case ('CURRENCY') {
          <app-money-input
            [inputId]="id"
            [ngModel]="value() ?? null"
            (ngModelChange)="value.set($event)"
            [maxFractionDigits]="2"
            styleClass="w-full"
            inputStyleClass="w-full"
            [disabled]="disabled()"
          />
        }
        @case ('PHONE') {
          <app-phone-input [inputId]="id" [value]="$any(value()) ?? null" (valueChange)="value.set($event)" [disabled]="disabled()" />
        }
        @case ('SSN') {
          <app-ssn-input [inputId]="id" [value]="$any(value()) ?? null" (valueChange)="value.set($event)" [disabled]="disabled()" />
        }
        @case ('DATE') {
          <app-date-input [inputId]="id" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event || null)" [disabled]="disabled()" />
        }
        @case ('SINGLE_SELECT') {
          <p-select
            [inputId]="id"
            [options]="f.options"
            optionLabel="label"
            optionValue="id"
            [ngModel]="value() ?? null"
            (ngModelChange)="value.set($event)"
            [showClear]="true"
            placeholder="Select…"
            styleClass="w-full"
            appendTo="body"
            [disabled]="disabled()"
          />
        }
        @case ('MULTI_SELECT') {
          <p-multiselect
            [inputId]="id"
            [options]="f.options"
            optionLabel="label"
            optionValue="id"
            [ngModel]="value() ?? []"
            (ngModelChange)="value.set($event)"
            display="chip"
            placeholder="Select…"
            styleClass="w-full"
            appendTo="body"
            [disabled]="disabled()"
          />
        }
        @default {
          <input pInputText [id]="id" class="w-full" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event)" [disabled]="disabled()" />
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ff-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.5rem;
    }
    .ff-checkbox label {
      margin-bottom: 0;
    }
    .ff-text {
      line-height: 1.55;
    }
    .ff-text ::ng-deep p {
      margin: 0 0 0.6rem;
    }
    .ff-text ::ng-deep p:last-child {
      margin-bottom: 0;
    }
    .ff-text ::ng-deep ul,
    .ff-text ::ng-deep ol {
      margin: 0 0 0.6rem;
      padding-left: 1.25rem;
    }
    label,
    .ff-legend {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 0.5rem;
    }
    .ff-legend {
      font-weight: 600;
    }
    .required-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-error, #d32f2f);
      flex-shrink: 0;
    }
    .ff-choices {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .ff-choice {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      width: 100%;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      background: var(--surface-card);
      color: inherit;
      font: inherit;
      text-align: left;
      line-height: 1.35;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .ff-choice:hover:not(:disabled) {
      border-color: var(--text-color-secondary);
    }
    .ff-choice .pi {
      margin-top: 0.15rem;
      color: var(--text-color-secondary);
    }
    .ff-choice--on {
      border-color: var(--text-color);
      background: var(--surface-ground);
    }
    .ff-choice--on .pi {
      color: var(--text-color);
    }
    .ff-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .ff-group-row {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--surface-border);
    }
    .ff-group-cells {
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      min-width: 0;
    }
    .ff-group-cell {
      flex: 1 1 10rem;
      min-width: 0;
    }
    .ff-group-cell--wide {
      flex-basis: 100%;
    }
    .ff-group-row p-button {
      margin-top: 1.6rem;
    }
    .ff-group-empty {
      margin: 0;
      color: var(--text-color-secondary);
    }
    .ff-files {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .ff-file {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .ff-file .pi-paperclip {
      color: var(--text-color-secondary);
    }
    .ff-file-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ff-file-link {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      color: var(--primary-color);
      cursor: pointer;
      text-align: left;
    }
    .ff-file-link:hover {
      text-decoration: underline;
    }
    .ff-file-size {
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }
    .ff-file-error {
      margin: 0;
      color: var(--p-red-500, #dc2626);
    }
  `,
})
export class FormFieldInputComponent {
  field = input.required<FormFieldDto>();
  value = model<unknown>(null);
  disabled = input(false);
  /** Mark required fields with a red dot (public page; staff can save with them empty). */
  showRequired = input(true);
  /** Show single and multi selects as a list of choices to click (public pages) instead of a dropdown. */
  choices = input(false);
  /** Keeps input ids unique when the same field shows more than once (rows of a repeating group). */
  idPrefix = input('');

  /** File uploads: how files are uploaded and opened on this page (no opener on public pages). */
  fileUpload = input<FormFileUploader | null>(null);
  fileOpen = input<FormFileOpener | null>(null);

  readonly maxRows = FORM_GROUP_MAX_ROWS;
  readonly fileAccept = FORM_FILE_ACCEPT;
  readonly fileMaxBytes = FORM_FILE_MAX_BYTES;
  protected readonly uploading = signal(false);
  protected readonly fileError = signal<string | null>(null);
  private readonly fileDrop = viewChild<SingleFileDropzoneComponent>('fileDrop');
  protected readonly files = computed<FormFileRef[]>(() => (Array.isArray(this.value()) && this.field().type === 'FILE' ? (this.value() as FormFileRef[]) : []));
  protected readonly canAddFile = computed(() => this.files().length < (this.field().multiple ? FORM_FILE_MAX_COUNT : 1) && !this.uploading());

  protected size(bytes: number) {
    return formatFileSize(bytes);
  }

  protected openFile(file: FormFileRef) {
    this.fileOpen()?.(file);
  }

  protected removeFile(file: FormFileRef) {
    const next = this.files().filter((f) => f.key !== file.key);
    this.value.set(next.length ? next : null);
  }

  /**
   * Upload dropped files one by one (up to the field's limit) and add them to the answer. Without an uploader
   * (the form preview, which saves nothing) the files are only listed.
   */
  protected async uploadFiles(list: File[]) {
    if (!list.length) return;
    const upload: FormFileUploader =
      this.fileUpload() ?? (async (file: File) => ({ key: `preview/${Date.now()}-${file.name}`, name: file.name, size: file.size, type: file.type }));
    const room = (this.field().multiple ? FORM_FILE_MAX_COUNT : 1) - this.files().length;
    this.fileError.set(list.length > room ? `You can add ${room === 1 ? 'one more file' : room + ' more files'}.` : null);
    this.uploading.set(true);
    try {
      for (const file of list.slice(0, Math.max(0, room))) {
        const ref = await upload(file);
        this.value.set([...this.files(), ref]);
      }
    } catch (err) {
      this.fileError.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Upload failed');
    } finally {
      this.uploading.set(false);
      this.fileDrop()?.reset();
    }
  }
  /** Repeating group: its sub-fields as fields, and the rows of the current value. */
  protected readonly subfields = computed(() => (this.field().subfields ?? []).map(subfieldAsField));
  protected readonly rows = computed<FormGroupRow[]>(() => (Array.isArray(this.value()) ? (this.value() as FormGroupRow[]) : []));
  /** The rows on screen: always at least one (empty) row to fill in, unless the field is read-only. */
  protected readonly shownRows = computed<FormGroupRow[]>(() => (this.rows().length || this.disabled() ? this.rows() : [{}]));

  protected hasData(row: FormGroupRow): boolean {
    return Object.values(row ?? {}).some((v) => v !== null && v !== undefined && v !== '');
  }

  protected addRow() {
    this.value.set([...this.shownRows(), {}]);
  }

  /** Deleting the last row leaves an empty one on screen (the value is cleared). */
  protected removeRow(index: number) {
    const next = this.shownRows().filter((_, i) => i !== index);
    this.value.set(next.length ? next : null);
  }

  protected setCell(index: number, subId: string, v: unknown) {
    const next = this.shownRows().map((row, i) => {
      if (i !== index) return row;
      const copy = { ...row };
      if (v === null || v === undefined || v === '') delete copy[subId];
      else copy[subId] = v;
      return copy;
    });
    this.value.set(next);
  }

  protected isPicked(id: string): boolean {
    const v = this.value();
    return Array.isArray(v) ? v.includes(id) : v === id;
  }

  protected pick(id: string) {
    if (this.field().type === 'MULTI_SELECT') {
      const cur = Array.isArray(this.value()) ? (this.value() as string[]) : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      this.value.set(next.length ? next : null);
    } else {
      this.value.set(id);
    }
  }
}
