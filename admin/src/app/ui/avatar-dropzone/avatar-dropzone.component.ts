import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { resolveAssetUrl } from '../../core/asset-url.util';

const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-avatar-dropzone',
  standalone: true,
  imports: [ButtonModule],
  styles: `
    .avatar-dropzone {
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
    .avatar-dropzone--active {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--surface-ground));
    }
    .avatar-dropzone-thumb {
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .avatar-dropzone-copy {
      flex: 1 1 auto;
      min-width: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
      line-height: 1.35;
    }
    .avatar-dropzone-copy strong {
      display: block;
      color: var(--text-color);
      font-weight: 600;
      font-size: var(--fs-sm);
    }
    .avatar-dropzone-icon {
      font-size: 1.1rem;
      color: var(--text-color-secondary);
      flex-shrink: 0;
    }
    .avatar-dropzone--active .avatar-dropzone-icon {
      color: var(--primary-color);
    }
    .avatar-dropzone-remove {
      flex-shrink: 0;
      margin-left: auto;
    }
    .avatar-dropzone--fill {
      max-width: none;
      width: 100%;
    }
    .avatar-panel-photo {
      position: relative;
      cursor: pointer;
      border-radius: 8px;
    }
    .avatar-panel-photo img {
      display: block;
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
      border-radius: 8px;
    }
    .avatar-panel-photo--active {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .avatar-panel-remove {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 1.75rem;
      height: 1.75rem;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: #fff;
      color: var(--color-severity-danger-text, #c62828);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .avatar-panel-remove .pi {
      font-size: 0.8rem;
    }
  `,
  template: `
    @if (panel() && displayUrl()) {
      <div
        class="avatar-panel-photo"
        [class.avatar-panel-photo--active]="dragOver()"
        role="button"
        tabindex="0"
        aria-label="Replace photo"
        (click)="onZoneClick()"
        (keydown.enter)="onZoneClick()"
        (keydown.space)="onZoneClick(); $event.preventDefault()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        <img [src]="displayUrl()!" alt="" />
        <button type="button" class="avatar-panel-remove" aria-label="Remove photo" (click)="onRemoveClick($event)">
          <i class="pi pi-trash" aria-hidden="true"></i>
        </button>
      </div>
    } @else {
      <div
        class="avatar-dropzone"
        [class.avatar-dropzone--fill]="panel()"
        [class.avatar-dropzone--active]="dragOver()"
        role="button"
        tabindex="0"
        (click)="onZoneClick()"
        (keydown.enter)="onZoneClick()"
        (keydown.space)="onZoneClick(); $event.preventDefault()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
      >
        @if (displayUrl()) {
          <img class="avatar-dropzone-thumb" [src]="displayUrl()!" alt="" />
          <span class="avatar-dropzone-copy">
            <strong>Photo</strong>
            Drop or click to replace
          </span>
          <p-button
            class="avatar-dropzone-remove"
            type="button"
            icon="pi pi-trash"
            severity="danger"
            [text]="true"
            size="small"
            aria-label="Remove photo"
            (click)="onRemoveClick($event)"
          />
        } @else {
          <i class="pi pi-user avatar-dropzone-icon" aria-hidden="true"></i>
          <span class="avatar-dropzone-copy">
            <strong>Photo (optional)</strong>
            Drop image or click to browse
          </span>
        }
      </div>
    }
    <input
      #fileInput
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp"
      hidden
      (change)="onFileInput($event)"
      (click)="$event.stopPropagation()"
    />
  `,
})
export class AvatarDropzoneComponent {
  /** Existing saved avatar URL (contact profile). */
  existingUrl = input<string | null | undefined>(null);
  /** Person page: large photo, or the upload control when there is none. */
  panel = input(false);

  fileChange = output<File | null>();
  invalidFile = output<string>();

  private readonly localPreview = signal<string | null>(null);
  readonly dragOver = signal(false);

  readonly displayUrl = computed(() => {
    const local = this.localPreview();
    if (local) return local;
    return resolveAssetUrl(this.existingUrl() ?? null);
  });

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

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
    const file = event.dataTransfer?.files?.[0];
    if (file) this.acceptFile(file);
  }

  onFileInput(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.acceptFile(file);
    input.value = '';
  }

  clear() {
    this.localPreview.set(null);
    this.fileChange.emit(null);
  }

  /** Reset after parent saves or closes a dialog. */
  reset() {
    this.localPreview.set(null);
    this.dragOver.set(false);
  }

  private acceptFile(file: File) {
    if (!AVATAR_MIMES.includes(file.type)) {
      this.invalidFile.emit('Use PNG, JPEG, GIF, or WebP.');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      this.invalidFile.emit('Image must be less than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => this.localPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
    this.fileChange.emit(file);
  }
}
