import { Component, computed, effect, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { fetchUploadDisplayName } from '../../core/content-disposition.util';
import { fileIconClass, isPdfFile, isRasterImage } from '../../core/file-type.util';
import { FileViewerDialogComponent, type ViewerFile } from '../file-viewer/file-viewer-dialog.component';

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export type FileUploadProgressItem = { name: string; done: boolean };

function isImageUrl(url: string): boolean {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  return /\.(png|jpe?g|gif|webp)$/.test(path);
}

function nameFromUrl(url: string): string {
  const path = url.split('?')[0] ?? '';
  const seg = path.split('/').pop();
  return seg || 'File';
}

/**
 * Single or multi file picker: inline row (receipt, form questions) or panel drop zone (artifacts, task attachments).
 * Use `[multiple]="true"` for multi; `[pickMode]="true"` when the parent uploads immediately and the zone should not keep a selection.
 */
@Component({
  selector: 'app-single-file-dropzone, app-file-dropzone',
  standalone: true,
  imports: [ButtonModule, FileViewerDialogComponent],
  styles: `
    .file-dropzone {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-height: 3.25rem;
      padding: 0.45rem 0.65rem;
      border: 1.5px dashed color-mix(in srgb, var(--color-severity-info-text) 45%, var(--surface-border));
      border-radius: 8px;
      background: var(--color-severity-info-bg);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      max-width: 16rem;
    }
    .file-dropzone--fill {
      max-width: none;
      width: 100%;
    }
    .file-dropzone--active {
      border-color: var(--color-severity-info-text);
      background: color-mix(in srgb, var(--color-severity-info-text) 14%, var(--color-severity-info-bg));
    }
    .file-dropzone--panel.file-dropzone--active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-ground));
    }
    .file-dropzone--panel {
      max-width: none;
      width: 100%;
      margin-bottom: 0.75rem;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 1.25rem 1rem;
      border-color: var(--surface-border);
      background: var(--surface-ground);
      text-align: center;
    }
    .file-dropzone--panel.file-dropzone--uploading {
      opacity: 0.85;
      pointer-events: none;
    }
    .file-dropzone-panel-icon {
      font-size: var(--fs-xl);
      color: var(--text-color-secondary);
    }
    .file-dropzone--panel.file-dropzone--active .file-dropzone-panel-icon {
      color: var(--primary-color);
    }
    .file-dropzone-panel-text {
      margin: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
    }
    .file-dropzone-panel-label {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .file-dropzone-panel-progress {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      margin-top: 0.25rem;
      width: 100%;
    }
    .file-dropzone-panel-progress-item {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }
    .file-dropzone-thumb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: var(--surface-card, #fff);
      cursor: pointer;
      flex-shrink: 0;
      overflow: hidden;
    }
    .file-dropzone-thumb-btn:hover {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-severity-info-text) 35%, transparent);
    }
    .file-dropzone-thumb-btn:focus-visible {
      outline: 2px solid var(--color-severity-info-text);
      outline-offset: 1px;
    }
    .file-dropzone-thumb {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .file-dropzone-copy {
      flex: 1 1 auto;
      min-width: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
      line-height: 1.35;
    }
    .file-dropzone-copy strong {
      display: block;
      color: var(--text-color);
      font-weight: 600;
      font-size: var(--fs-sm);
    }
    .file-dropzone-icon {
      font-size: 1.1rem;
      color: var(--color-severity-info-text);
      flex-shrink: 0;
    }
    .file-dropzone-thumb-btn .file-dropzone-icon {
      font-size: 1.25rem;
    }
    .file-dropzone-remove {
      flex-shrink: 0;
    }
  `,
  template: `
    @if (layout() === 'panel') {
      <div
        [class]="panelRootClass()"
        [class.file-dropzone--active]="dragOver()"
        [class.file-dropzone--uploading]="uploading()"
        [attr.role]="zoneOpensPicker() ? 'button' : null"
        [attr.tabindex]="zoneOpensPicker() ? 0 : null"
        [attr.aria-label]="panelAriaLabel()"
        (click)="onPanelZoneClick($event)"
        (keydown.enter)="zoneOpensPicker() && openPicker()"
        (keydown.space)="zoneOpensPicker() && openPicker(); $event.preventDefault()"
        (dragenter)="onPanelDragEnter($event)"
        (dragleave)="onPanelDragLeave($event)"
        (dragover)="onDragOver($event)"
        (drop)="onDrop($event)"
      >
        <span class="file-dropzone-panel-label tm-attach-drop-label">
          <i class="pi pi-cloud-upload file-dropzone-panel-icon artifact-dropzone-icon" aria-hidden="true"></i>
          <span class="file-dropzone-panel-text artifact-dropzone-text">{{ emptyHint() }}</span>
        </span>
        @if (showBrowseButton()) {
          <p-button
            type="button"
            [label]="browseButtonLabel()"
            icon="pi pi-upload"
            severity="secondary"
            [loading]="uploading()"
            [disabled]="uploading()"
            (onClick)="openPickerFromButton($event)"
          />
        }
        @if (uploadProgress().length) {
          <div class="file-dropzone-panel-progress artifact-upload-progress">
            @for (p of uploadProgress(); track p.name) {
              <span class="file-dropzone-panel-progress-item artifact-upload-item">
                <i
                  class="pi"
                  [class.pi-check]="p.done"
                  [class.pi-spin]="!p.done"
                  [class.pi-spinner]="!p.done"
                  aria-hidden="true"
                ></i>
                {{ p.name }}
              </span>
            }
          </div>
        }
      </div>
    } @else {
      <div
        class="file-dropzone"
        [class.file-dropzone--fill]="fill()"
        [class.file-dropzone--active]="dragOver()"
        role="button"
        tabindex="0"
        [attr.aria-label]="ariaLabel()"
        (click)="onZoneClick()"
        (keydown.enter)="onZoneClick()"
        (keydown.space)="onZoneClick(); $event.preventDefault()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        @if (canOpenView()) {
          <button
            type="button"
            class="file-dropzone-thumb-btn"
            [attr.aria-label]="'View ' + viewFileName()"
            (click)="openView($event)"
          >
            @if (previewUrl()) {
              <img class="file-dropzone-thumb" [src]="previewUrl()!" alt="" />
            } @else {
              <i class="pi {{ thumbIcon() }} file-dropzone-icon" aria-hidden="true"></i>
            }
          </button>
        } @else {
          <i class="pi {{ emptyIcon() }} file-dropzone-icon" aria-hidden="true"></i>
        }
        <span class="file-dropzone-copy">
          <strong>{{ headline() }}</strong>
          {{ subline() }}
        </span>
        @if (showRemove()) {
          <p-button
            class="file-dropzone-remove"
            type="button"
            icon="pi pi-trash"
            severity="danger"
            [text]="true"
            size="small"
            aria-label="Remove file"
            (click)="onRemoveClick($event)"
          />
        }
      </div>
    }
    <input
      #fileInput
      type="file"
      [accept]="accept()"
      [multiple]="multiple()"
      hidden
      (change)="onFileInput($event)"
      (click)="$event.stopPropagation()"
    />
    <app-file-viewer-dialog [file]="viewerFile()" (closed)="viewerFile.set(null)" />
  `,
})
export class SingleFileDropzoneComponent {
  existingUrl = input<string | null | undefined>(null);
  /** Original filename when `existingUrl` points at stored upload metadata. */
  existingDisplayName = input<string | null | undefined>(null);
  accept = input('image/png,image/jpeg,image/gif,image/webp,application/pdf');
  maxBytes = input(10 * 1024 * 1024);
  emptyTitle = input('File (optional)');
  emptyHint = input('Drop file or click to browse');
  selectedTitle = input('File');
  replaceHint = input('Drop or click to replace');
  emptyIcon = input('pi-file');
  fill = input(false);
  /** Allow selecting more than one file (`filesChange`). */
  multiple = input(false);
  /** `inline` row vs centered **panel** drop zone (artifacts, task attachments). */
  layout = input<'inline' | 'panel'>('inline');
  /** Extra classes on the panel root (e.g. `tm-attach-drop`). */
  panelClass = input('');
  /** Emit selected files and clear local state (immediate upload flows). */
  pickMode = input(false);
  /** Panel: whole zone opens the file picker; set false when only the browse button should. */
  zoneOpensPicker = input(true);
  showBrowseButton = input(false);
  browseButtonLabel = input('Upload Files');
  uploading = input(false);
  uploadProgress = input<FileUploadProgressItem[]>([]);

  fileChange = output<File | null>();
  filesChange = output<File[]>();
  invalidFile = output<string>();
  /** User removed the server-stored file shown before a new upload. */
  existingCleared = output<void>();

  readonly dragOver = signal(false);
  private readonly localPreview = signal<string | null>(null);
  readonly localFile = signal<File | null>(null);
  readonly localFiles = signal<File[]>([]);
  private readonly existingHidden = signal(false);
  private readonly fetchedExistingName = signal<string | null>(null);
  readonly viewerFile = signal<ViewerFile | null>(null);
  private panelDragDepth = 0;

  readonly existingLabel = computed(() => {
    const explicit = this.existingDisplayName()?.trim();
    if (explicit) return explicit;
    return this.fetchedExistingName()?.trim() || null;
  });

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly existingViewUrl = computed(() =>
    this.existingHidden() ? null : resolveAssetUrl(this.existingUrl() ?? null),
  );

  readonly previewUrl = computed(() => {
    const local = this.localPreview();
    if (local) return local;
    const url = this.existingViewUrl();
    if (!url) return null;
    const label = this.existingLabel() || nameFromUrl(url);
    if (isRasterImage(label, null) || isImageUrl(url)) return url;
    return null;
  });

  readonly canOpenView = computed(() => {
    if (this.localFile()) return true;
    if (this.localFiles().length) return true;
    return !!this.existingViewUrl();
  });

  readonly showRemove = computed(() => this.layout() === 'inline' && this.canOpenView());

  readonly thumbIcon = computed(() => {
    const file = this.localFile();
    if (file) return fileIconClass(file.name, file.type);
    const url = this.existingViewUrl();
    if (url) return fileIconClass(this.existingLabel() || nameFromUrl(url), null);
    return this.emptyIcon();
  });

  readonly headline = computed(() => {
    const files = this.localFiles();
    if (files.length) return this.selectedTitle();
    const file = this.localFile();
    if (file) return this.selectedTitle();
    if (this.existingViewUrl()) return this.selectedTitle();
    return this.emptyTitle();
  });

  readonly subline = computed(() => {
    const files = this.localFiles();
    if (files.length) return files.map((f) => f.name).join(', ');
    const file = this.localFile();
    if (file) return file.name;
    if (this.existingViewUrl()) {
      return this.existingLabel() || this.replaceHint();
    }
    return this.emptyHint();
  });

  ariaLabel = computed(() => this.headline() + '. ' + this.subline());

  panelAriaLabel = computed(() => {
    if (!this.zoneOpensPicker()) return null;
    return `Attach files: ${this.emptyHint()}`;
  });

  panelRootClass = computed(() => {
    const extra = this.panelClass().trim();
    return ['file-dropzone', 'file-dropzone--panel', 'artifact-dropzone', extra].filter(Boolean).join(' ');
  });

  constructor() {
    effect(() => {
      this.existingUrl();
      this.existingDisplayName();
      this.existingHidden.set(false);
    });
    effect(() => {
      const url = this.existingViewUrl();
      const explicit = this.existingDisplayName()?.trim();
      if (!url || explicit) {
        this.fetchedExistingName.set(null);
        return;
      }
      void fetchUploadDisplayName(url).then((name) => {
        if (this.existingViewUrl() === url) this.fetchedExistingName.set(name);
      });
    });
  }

  /** Open the hidden file input (e.g. toolbar attach button). */
  openPicker() {
    if (this.uploading()) return;
    this.fileInput()?.nativeElement.click();
  }

  viewFileName(): string {
    const file = this.localFile();
    if (file) return file.name;
    const files = this.localFiles();
    if (files.length) return files[0]!.name;
    const label = this.existingLabel();
    if (label) return label;
    const url = this.existingViewUrl();
    return url ? nameFromUrl(url) : this.selectedTitle();
  }

  openView(event: Event) {
    event.stopPropagation();
    const local = this.localFile();
    if (local) {
      this.openLocalFile(local);
      return;
    }
    const files = this.localFiles();
    if (files.length) {
      this.openLocalFile(files[0]!);
      return;
    }
    const url = this.existingViewUrl();
    if (!url) return;
    const name = this.existingLabel() || nameFromUrl(url);
    if (isRasterImage(name, null) || isRasterImage(url, null)) {
      this.viewerFile.set({ name, kind: 'image', url });
      return;
    }
    if (isPdfFile(name, null) || isPdfFile(url, null)) {
      this.viewerFile.set({ name, kind: 'pdf', url });
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private openLocalFile(file: File) {
    const name = file.name;
    if (isRasterImage(name, file.type)) {
      const url = this.localPreview() ?? URL.createObjectURL(file);
      this.viewerFile.set({ name, kind: 'image', url });
      return;
    }
    if (isPdfFile(name, file.type)) {
      const url = URL.createObjectURL(file);
      this.viewerFile.set({
        name,
        kind: 'pdf',
        url,
        loadBlob: async () => file,
      });
      return;
    }
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onZoneClick() {
    if (this.uploading()) return;
    this.openPicker();
  }

  onPanelZoneClick(event: MouseEvent) {
    if (!this.zoneOpensPicker() || this.uploading()) return;
    if ((event.target as HTMLElement).closest('p-button, .p-button')) return;
    this.openPicker();
  }

  openPickerFromButton(event: Event) {
    event.stopPropagation();
    this.openPicker();
  }

  onRemoveClick(event: Event) {
    event.stopPropagation();
    this.clear();
  }

  onDragOver(event: DragEvent) {
    if (this.uploading()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer?.types.includes('Files')) {
      event.dataTransfer.dropEffect = 'copy';
    }
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (this.layout() === 'panel') return;
    this.dragOver.set(false);
  }

  onPanelDragEnter(event: DragEvent) {
    if (this.uploading()) return;
    event.preventDefault();
    event.stopPropagation();
    this.panelDragDepth++;
    this.dragOver.set(true);
  }

  onPanelDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.panelDragDepth = Math.max(0, this.panelDragDepth - 1);
    if (this.panelDragDepth === 0) this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.panelDragDepth = 0;
    this.dragOver.set(false);
    if (this.uploading()) return;
    const list = event.dataTransfer?.files;
    if (!list?.length) return;
    if (this.multiple()) this.acceptFiles(Array.from(list));
    else if (list[0]) this.acceptFile(list[0]);
  }

  onFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const list = input.files;
    if (list?.length) {
      if (this.multiple()) this.acceptFiles(Array.from(list));
      else this.acceptFile(list[0]!);
    }
    input.value = '';
  }

  clear() {
    if (this.localFile() || this.localFiles().length) {
      this.clearLocalSelection();
      if (this.multiple()) this.filesChange.emit([]);
      else this.fileChange.emit(null);
      return;
    }
    if (this.existingViewUrl()) {
      this.existingHidden.set(true);
      this.existingCleared.emit();
      this.fileChange.emit(null);
    }
  }

  reset() {
    this.existingHidden.set(false);
    this.fetchedExistingName.set(null);
    this.clearLocalSelection();
    this.dragOver.set(false);
    this.panelDragDepth = 0;
    this.viewerFile.set(null);
  }

  private clearLocalSelection() {
    this.localPreview.set(null);
    this.localFile.set(null);
    this.localFiles.set([]);
  }

  private acceptFiles(files: File[]) {
    const valid: File[] = [];
    for (const file of files) {
      const err = this.validate(file);
      if (err) {
        this.invalidFile.emit(err);
        return;
      }
      valid.push(file);
    }
    if (!valid.length) return;
    if (this.pickMode()) {
      this.filesChange.emit(valid);
      return;
    }
    this.localFile.set(null);
    this.localPreview.set(null);
    this.localFiles.set(valid);
    this.filesChange.emit(valid);
  }

  private acceptFile(file: File) {
    const err = this.validate(file);
    if (err) {
      this.invalidFile.emit(err);
      return;
    }
    if (this.pickMode()) {
      this.fileChange.emit(file);
      return;
    }
    this.localFiles.set([]);
    this.localFile.set(file);
    if (IMAGE_MIMES.has(file.type)) {
      const reader = new FileReader();
      reader.onload = (e) => this.localPreview.set(e.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      this.localPreview.set(null);
    }
    this.fileChange.emit(file);
  }

  private validate(file: File): string | null {
    const accept = this.accept().trim();
    if (accept && accept !== '*/*') {
      const allowed = accept.split(',').map((s) => s.trim().toLowerCase());
      const type = file.type.toLowerCase();
      const name = file.name.toLowerCase();
      const ok =
        allowed.some((a) => a === type) ||
        allowed.some((a) => a.startsWith('.') && name.endsWith(a)) ||
        allowed.some((a) => a.endsWith('/*') && type.startsWith(a.slice(0, -1)));
      if (!ok) return 'That file type is not allowed.';
    }
    if (file.size > this.maxBytes()) {
      const mb = Math.round(this.maxBytes() / (1024 * 1024));
      return `File must be less than ${mb} MB.`;
    }
    return null;
  }
}

/** @deprecated Use SingleFileDropzoneComponent; alias selector is `app-file-dropzone`. */
export { SingleFileDropzoneComponent as FileDropzoneComponent };
