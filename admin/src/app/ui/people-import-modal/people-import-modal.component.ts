import { Component, inject, signal, viewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CommunicationsApi, type PeopleImportPreview, type PeopleImportPreviewRow } from '../../core/communications.api';
import { SingleFileDropzoneComponent } from '../single-file-dropzone/single-file-dropzone.component';

type Step = 'pick' | 'preview' | 'done';

@Component({
  selector: 'app-people-import-modal',
  standalone: true,
  imports: [AppDialogModule, ButtonModule, MessageModule, TableModule, SingleFileDropzoneComponent],
  template: `
    <p-dialog
      header="Import people"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!busy()"
      [style]="{ width: 'min(52rem, 96vw)' }"
      appendTo="body"
    >
      @if (step() === 'pick') {
        <div class="form-field">
          <label>Spreadsheet file</label>
          <app-single-file-dropzone
            #csvDrop
            [fill]="true"
            accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            [maxBytes]="2 * 1024 * 1024"
            [uploading]="busy()"
            emptyTitle="People list"
            emptyHint="Drop a CSV or Excel file or click to browse"
            selectedTitle="People list"
            replaceHint="Drop or click to replace"
            emptyIcon="pi-file-import"
            (fileChange)="onCsvFile($event)"
            (invalidFile)="error.set($event)"
          />
        </div>
        @if (error()) {
          <p-message severity="error" styleClass="w-full mt-3" [text]="error()!" />
        }
      }

      @if (step() === 'preview' && preview()) {
        <p class="mt-0 mb-3">
          <strong>{{ preview()!.totalRows }}</strong> row{{ preview()!.totalRows === 1 ? '' : 's' }} found.
          Will create <strong>{{ preview()!.summary.create }}</strong>,
          skip <strong>{{ preview()!.summary.skip }}</strong> duplicate{{ preview()!.summary.skip === 1 ? '' : 's' }}.
          @if (preview()!.summary.organizationsToCreate > 0) {
            <span class="text-color-secondary">
              {{ preview()!.summary.organizationsToCreate }} new organization{{
                preview()!.summary.organizationsToCreate === 1 ? '' : 's'
              }}
              as Partner / other (no tags).
            </span>
          }
        </p>
        <p class="text-sm text-color-secondary mt-0 mb-2">First 10 rows:</p>
        <p-table [value]="preview()!.preview" styleClass="table-bordered people-import-preview-table">
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Organization</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>{{ rowLabel(row) }}</td>
              <td>{{ row.email }}</td>
              <td>{{ row.organization }}</td>
            </tr>
          </ng-template>
        </p-table>
        @if (error()) {
          <p-message severity="error" styleClass="w-full mt-3" [text]="error()!" />
        }
        <div class="flex justify-content-end gap-2 mt-4">
          <p-button
            label="Back"
            severity="secondary"
            [outlined]="true"
            [disabled]="busy()"
            (onClick)="backToPick()"
          />
          <p-button
            label="Import"
            icon="pi pi-check"
            [loading]="busy()"
            [disabled]="preview()!.summary.create === 0"
            (onClick)="runImport()"
          />
        </div>
      }

      @if (step() === 'done' && result()) {
        <p class="mt-0">
          Created <strong>{{ result()!.created }}</strong> people.
          @if (result()!.skipped) {
            Skipped <strong>{{ result()!.skipped }}</strong> duplicate{{ result()!.skipped === 1 ? '' : 's' }}.
          }
          @if (result()!.failed) {
            <span class="text-color-secondary">{{ result()!.failed }} could not be imported.</span>
          }
        </p>
        @if (result()!.errors.length) {
          <ul class="text-sm text-color-secondary pl-3">
            @for (e of result()!.errors.slice(0, 5); track e.line) {
              <li>Row {{ e.line }}: {{ e.message }}</li>
            }
          </ul>
        }
        <div class="flex justify-content-end mt-4">
          <p-button label="Done" (onClick)="close(true)" />
        </div>
      }
    </p-dialog>
  `,
  styles: `
    :host ::ng-deep .people-import-preview-table .p-datatable-table {
      font-size: var(--fs-sm, 0.875rem);
    }
  `,
})
export class PeopleImportModalComponent {
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);
  private readonly csvDrop = viewChild<SingleFileDropzoneComponent>('csvDrop');

  readonly visible = signal(false);
  readonly step = signal<Step>('pick');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = signal<PeopleImportPreview | null>(null);
  readonly result = signal<{ created: number; skipped: number; failed: number; errors: { line: number; message: string }[] } | null>(null);

  private fileBase64: string | null = null;
  private resolve: ((imported: boolean) => void) | null = null;

  open(): Promise<boolean> {
    this.reset();
    this.visible.set(true);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onVisibleChange(visible: boolean) {
    if (!visible) this.close(false);
  }

  close(imported: boolean) {
    this.visible.set(false);
    this.resolve?.(imported);
    this.resolve = null;
  }

  backToPick() {
    this.step.set('pick');
    this.preview.set(null);
    this.fileBase64 = null;
    this.error.set(null);
    this.csvDrop()?.reset();
  }

  async onCsvFile(file: File | null) {
    if (!file) return;

    this.busy.set(true);
    this.error.set(null);
    try {
      const base64 = await readFileBase64(file);
      this.fileBase64 = base64;
      const preview = await this.comms.previewPeopleImport(base64);
      this.preview.set(preview);
      this.step.set('preview');
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not read that file');
    } finally {
      this.busy.set(false);
    }
  }

  async runImport() {
    if (!this.fileBase64 || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.comms.runPeopleImport(this.fileBase64);
      this.result.set(result);
      this.step.set('done');
      this.toast.add({
        severity: 'success',
        summary: 'Import complete',
        detail: `Created ${result.created} people.`,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.busy.set(false);
    }
  }

  rowLabel(row: PeopleImportPreviewRow): string {
    const last = row.lastName?.trim();
    return last ? `${row.firstName} ${last}` : row.firstName;
  }

  private reset() {
    this.step.set('pick');
    this.busy.set(false);
    this.error.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.fileBase64 = null;
    queueMicrotask(() => this.csvDrop()?.reset());
  }
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(buf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      resolve(btoa(binary));
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsArrayBuffer(file);
  });
}
