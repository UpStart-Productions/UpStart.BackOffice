import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { resolveAssetUrl } from '../../core/asset-url.util';

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

function isImageUrl(url: string): boolean {
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  return /\.(png|jpe?g|gif|webp)$/.test(path);
}

@Component({
  selector: 'app-single-file-dropzone',
  standalone: true,
  imports: [ButtonModule],
  styles: `
    .file-dropzone {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-height: 3.25rem;
      padding: 0.45rem 0.65rem;
      border: 1.5px dashed var(--surface-border);
      border-radius: 8px;
      background: var(--surface-ground);
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      max-width: 16rem;
    }
    .file-dropzone--fill {
      max-width: none;
      width: 100%;
    }
    .file-dropzone--active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-ground));
    }
    .file-dropzone-thumb {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 6px;
      object-fit: cover;
      flex-shrink: 0;
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
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }
    .file-dropzone--active .file-dropzone-icon {
      color: var(--primary-color);
    }
    .file-dropzone-remove {
      flex-shrink: 0;
      margin-left: auto;
    }
    .file-dropzone-view {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin-top: 0.15rem;
      font-size: var(--fs-sm);
      color: var(--primary-color);
      text-decoration: none;
    }
    .file-dropzone-view:hover {
      text-decoration: underline;
    }
  `,
  template: `
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
      @if (previewUrl()) {
        <img class="file-dropzone-thumb" [src]="previewUrl()!" alt="" />
      } @else {
        <i class="pi {{ emptyIcon() }} file-dropzone-icon" aria-hidden="true"></i>
      }
      <span class="file-dropzone-copy">
        <strong>{{ headline() }}</strong>
        {{ subline() }}
        @if (existingViewUrl() && !localFile() && !localFiles().length) {
          <a
            class="file-dropzone-view"
            [href]="existingViewUrl()!"
            target="_blank"
            rel="noopener noreferrer"
            (click)="$event.stopPropagation()"
          >
            <i class="pi pi-external-link" aria-hidden="true"></i> View current file
          </a>
        }
      </span>
      @if (localFile() || localFiles().length) {
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
    <input
      #fileInput
      type="file"
      [accept]="accept()"
      [multiple]="multiple()"
      hidden
      (change)="onFileInput($event)"
      (click)="$event.stopPropagation()"
    />
  `,
})
export class SingleFileDropzoneComponent {
  existingUrl = input<string | null | undefined>(null);
  accept = input('image/png,image/jpeg,image/gif,image/webp,application/pdf');
  maxBytes = input(10 * 1024 * 1024);
  emptyTitle = input('File (optional)');
  emptyHint = input('Drop file or click to browse');
  selectedTitle = input('File');
  replaceHint = input('Drop or click to replace');
  emptyIcon = input('pi-file');
  fill = input(false);
  multiple = input(false);

  fileChange = output<File | null>();
  filesChange = output<File[]>();
  invalidFile = output<string>();

  readonly dragOver = signal(false);
  private readonly localPreview = signal<string | null>(null);
  readonly localFile = signal<File | null>(null);
  readonly localFiles = signal<File[]>([]);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  readonly existingViewUrl = computed(() => resolveAssetUrl(this.existingUrl() ?? null));

  readonly previewUrl = computed(() => {
    const local = this.localPreview();
    if (local) return local;
    const url = this.existingViewUrl();
    if (url && isImageUrl(url)) return url;
    return null;
  });

  readonly headline = computed(() => {
    const files = this.localFiles();
    if (files.length) return this.selectedTitle();
    const file = this.localFile();
    if (file) return this.selectedTitle();
    if (this.existingUrl()) return this.selectedTitle();
    return this.emptyTitle();
  });

  readonly subline = computed(() => {
    const files = this.localFiles();
    if (files.length) return files.map((f) => f.name).join(', ');
    const file = this.localFile();
    if (file) return file.name;
    if (this.existingUrl()) return this.replaceHint();
    return this.emptyHint();
  });

  ariaLabel = computed(() => this.headline() + '. ' + this.subline());

  onZoneClick() {
    this.fileInput()?.nativeElement.click();
  }

  onRemoveClick(event: Event) {
    event.stopPropagation();
    this.clear();
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
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
    this.localPreview.set(null);
    this.localFile.set(null);
    this.localFiles.set([]);
    if (this.multiple()) this.filesChange.emit([]);
    else this.fileChange.emit(null);
  }

  reset() {
    this.clear();
    this.dragOver.set(false);
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
