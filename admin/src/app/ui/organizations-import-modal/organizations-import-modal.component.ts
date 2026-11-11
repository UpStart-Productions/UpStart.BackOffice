import { Component, inject, signal, viewChild } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ACCOUNT_JOURNEY_LABELS, type AccountJourney } from '@upstart/back-office/shared';
import { SingleFileDropzoneComponent } from '../single-file-dropzone/single-file-dropzone.component';

type Step = 'pick' | 'preview' | 'done';

export type OrganizationImportPreviewRow = {
  line: number;
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  journey: AccountJourney;
  tags: string[];
  status: 'create' | 'skip' | 'error';
  statusMessage?: string;
};

export type OrganizationImportPreview = {
  totalRows: number;
  preview: OrganizationImportPreviewRow[];
  summary: { create: number; skip: number; error: number };
};

export type OrganizationImportResult = {
  created: number;
  skipped: number;
  failed: number;
  errors: { line: number; message: string }[];
};

@Component({
  selector: 'app-organizations-import-modal',
  standalone: true,
  imports: [AppDialogModule, ButtonModule, MessageModule, TableModule, SingleFileDropzoneComponent],
  template: `
    <p-dialog
      header="Import organizations"
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
            #fileDrop
            [fill]="true"
            accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            [maxBytes]="2 * 1024 * 1024"
            [uploading]="busy()"
            emptyTitle="Organization list"
            emptyHint="Drop a CSV or Excel file or click to browse"
            selectedTitle="Organization list"
            replaceHint="Drop or click to replace"
            emptyIcon="pi-file-import"
            (fileChange)="onFile($event)"
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
        </p>
        <p class="text-sm text-color-secondary mt-0 mb-2">First 10 rows:</p>
        <p-table [value]="preview()!.preview" styleClass="table-bordered org-import-preview-table">
          <ng-template pTemplate="header">
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-row>
            <tr>
              <td>{{ row.name }}</td>
              <td>{{ row.email }}</td>
              <td>{{ journeyLabel(row.journey) }}</td>
            </tr>
          </ng-template>
        </p-table>
        @if (error()) {
          <p-message severity="error" styleClass="w-full mt-3" [text]="error()!" />
        }
        <div class="flex justify-content-end gap-2 mt-4">
          <p-button label="Back" severity="secondary" [outlined]="true" [disabled]="busy()" (onClick)="backToPick()" />
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
          Created <strong>{{ result()!.created }}</strong> organizations.
          @if (result()!.skipped) {
            Skipped <strong>{{ result()!.skipped }}</strong> duplicate{{ result()!.skipped === 1 ? '' : 's' }}.
          }
          @if (result()!.failed) {
            <span class="text-color-secondary">{{ result()!.failed }} could not be imported.</span>
          }
        </p>
        <div class="flex justify-content-end mt-4">
          <p-button label="Done" (onClick)="close(true)" />
        </div>
      }
    </p-dialog>
  `,
  styles: `
    :host ::ng-deep .org-import-preview-table .p-datatable-table {
      font-size: var(--fs-sm, 0.875rem);
    }
  `,
})
export class OrganizationsImportModalComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly fileDrop = viewChild<SingleFileDropzoneComponent>('fileDrop');

  readonly visible = signal(false);
  readonly step = signal<Step>('pick');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly preview = signal<OrganizationImportPreview | null>(null);
  readonly result = signal<OrganizationImportResult | null>(null);

  private fileBase64: string | null = null;
  private resolve: ((imported: boolean) => void) | null = null;

  open(): Promise<boolean> {
    this.reset();
    this.visible.set(true);
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  journeyLabel(journey: AccountJourney): string {
    return ACCOUNT_JOURNEY_LABELS[journey] ?? journey;
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
    this.fileDrop()?.reset();
  }

  async onFile(file: File | null) {
    if (!file) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const base64 = await readFileBase64(file);
      this.fileBase64 = base64;
      this.preview.set(await this.api.post<OrganizationImportPreview>('/clients/import/preview', { fileBase64: base64 }));
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
      const result = await this.api.post<OrganizationImportResult>('/clients/import', { fileBase64: this.fileBase64 });
      this.result.set(result);
      this.step.set('done');
      this.toast.add({
        severity: 'success',
        summary: 'Import complete',
        detail: `Created ${result.created} organizations.`,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.busy.set(false);
    }
  }

  private reset() {
    this.step.set('pick');
    this.busy.set(false);
    this.error.set(null);
    this.preview.set(null);
    this.result.set(null);
    this.fileBase64 = null;
    queueMicrotask(() => this.fileDrop()?.reset());
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
