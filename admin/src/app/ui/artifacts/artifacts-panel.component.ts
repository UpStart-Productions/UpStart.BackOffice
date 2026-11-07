import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import {
  FileViewerDialogComponent,
  type ViewerFile,
} from '../file-viewer/file-viewer-dialog.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TabsModule } from 'primeng/tabs';
import { MessageModule } from 'primeng/message';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { fileExtension, fileExtLabel, fileIconClass, isRasterImage } from '../../core/file-type.util';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { bindQuillPersonCardScope } from '../../core/quill-person-card-scope';
import { SingleFileDropzoneComponent } from '../single-file-dropzone/single-file-dropzone.component';
import type Quill from 'quill';

type Artifact = {
  id: string;
  type: 'FILE' | 'LINK' | 'NOTE';
  title: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  url?: string;
  content?: string;
  createdAt: string;
};

/** Raster images only — SVG and documents use icon cards (img preview often fails for SVG). */

@Component({
  selector: 'app-artifacts-panel',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    TabsModule,
    MessageModule,
    QuillModule,
    SingleFileDropzoneComponent,
    FileViewerDialogComponent,
  ],
  template: `
    <div class="card">
      <h3 class="showcase-section-title mb-3">{{ sectionTitle() }}</h3>

      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      }

      <p-tabs [value]="0">
        <p-tablist>
          <p-tab [value]="0"><i class="pi pi-paperclip"></i>&nbsp; Files ({{ files().length }})</p-tab>
          <p-tab [value]="1"><i class="pi pi-link"></i>&nbsp; Links ({{ links().length }})</p-tab>
          <p-tab [value]="2"><i class="pi pi-file-edit"></i>&nbsp; Notes ({{ notes().length }})</p-tab>
        </p-tablist>

        <p-tabpanels>

          <!-- ── FILES ──────────────────────────────────────────────────── -->
          <p-tabpanel [value]="0">
            <app-file-dropzone
              layout="panel"
              [multiple]="true"
              [pickMode]="true"
              [zoneOpensPicker]="false"
              [showBrowseButton]="true"
              accept="*/*"
              [maxBytes]="50 * 1024 * 1024"
              emptyHint="Drag and drop files here, or"
              [uploading]="uploading()"
              [uploadProgress]="uploadProgress()"
              (filesChange)="uploadFiles($event)"
              (invalidFile)="error.set($event)"
            />

            <div class="artifact-card-grid">
              @for (a of files(); track a.id) {
                <div class="artifact-file-card">
                  <button
                    class="artifact-card-delete"
                    pButton
                    icon="pi pi-trash"
                    [rounded]="true"
                    [text]="true"
                    severity="danger"
                    size="small"
                    [attr.aria-label]="'Delete ' + a.title"
                    (click)="deleteArtifact(a, $event)"
                  ></button>
                  <div
                    class="artifact-file-card-inner artifact-file-card-inner--clickable"
                    role="button"
                    tabindex="0"
                    (click)="openFile(a)"
                    (keydown.enter)="openFile(a)"
                    (keydown.space)="openFile(a); $event.preventDefault()"
                  >
                    @if (isImage(a)) {
                      <img [src]="fileUrl(a)" [alt]="a.title" class="artifact-file-thumb" />
                    } @else {
                      <div class="artifact-file-icon-wrap">
                        <i class="pi {{ fileIcon(a) }} artifact-file-icon"></i>
                        <span class="artifact-file-ext">{{ fileExt(a) }}</span>
                      </div>
                    }
                    <div class="artifact-file-footer">
                      <div class="artifact-file-name">{{ a.title }}</div>
                      <time class="artifact-meta">{{ formatCreatedDate(a.createdAt) }}</time>
                    </div>
                  </div>
                </div>
              }
              @if (files().length === 0) {
                <p class="artifact-empty">No files attached yet.</p>
              }
            </div>
          </p-tabpanel>

          <!-- ── LINKS ──────────────────────────────────────────────────── -->
          <p-tabpanel [value]="1">
            <div class="artifact-add-form">
              <div class="form-field">
                <label>Title</label>
                <input pInputText [(ngModel)]="newLinkTitle" placeholder="e.g. Proposal Doc" class="w-full" />
              </div>
              <div class="form-field">
                <label>URL</label>
                <input pInputText [(ngModel)]="newLinkUrl" placeholder="https://..." class="w-full" />
              </div>
              <button pButton label="Add Link" icon="pi pi-plus" severity="secondary" (click)="addLink()" [disabled]="!newLinkTitle || !newLinkUrl"></button>
            </div>

            <div class="artifact-card-grid">
              @for (a of links(); track a.id) {
                <div class="artifact-link-card">
                  <button
                    class="artifact-card-delete"
                    pButton icon="pi pi-trash"
                    [rounded]="true" [text]="true" severity="danger" size="small"
                    (click)="deleteArtifact(a)"
                  ></button>
                  <a [href]="a.url" target="_blank" class="artifact-link-card-inner">
                    <div class="artifact-link-icon-wrap">
                      <i class="pi pi-link artifact-link-icon"></i>
                    </div>
                    <div class="artifact-link-title">{{ a.title }}</div>
                    <div class="artifact-link-url">{{ a.url }}</div>
                    <time class="artifact-meta">{{ formatCreatedDate(a.createdAt) }}</time>
                  </a>
                </div>
              }
              @if (links().length === 0) {
                <p class="artifact-empty">No links yet.</p>
              }
            </div>
          </p-tabpanel>

          <!-- ── NOTES ──────────────────────────────────────────────────── -->
          <p-tabpanel [value]="2">
            <div class="artifact-add-form">
              <div class="form-field">
                <label>Title</label>
                <input pInputText [(ngModel)]="newNoteTitle" placeholder="e.g. Research Notes" class="w-full" />
              </div>
              <quill-editor
                [(ngModel)]="newNoteContent"
                placeholder="Write your note..."
                [styles]="{ 'min-height': '140px' }"
                (onEditorCreated)="onNoteEditor($event)"
              ></quill-editor>
              <button pButton label="Add Note" icon="pi pi-plus" severity="secondary" (click)="addNote()" [disabled]="!newNoteTitle || !newNoteContent"></button>
            </div>
            <div class="artifact-list">
              @for (a of notes(); track a.id) {
                <div class="artifact-item artifact-item--note">
                  <div class="artifact-item-header">
                    <div class="artifact-item-heading">
                      <span class="artifact-title">{{ a.title }}</span>
                      <time class="artifact-meta">{{ formatCreatedDate(a.createdAt) }}</time>
                    </div>
                    <button pButton icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (click)="deleteArtifact(a)"></button>
                  </div>
                  <div class="artifact-note-content ql-editor" [innerHTML]="sanitizeHtml(a.content)"></div>
                </div>
              }
              @if (notes().length === 0) {
                <p class="artifact-empty">No notes yet.</p>
              }
            </div>
          </p-tabpanel>

        </p-tabpanels>
      </p-tabs>

      <app-file-viewer-dialog [file]="viewerFile()" (closed)="viewerFile.set(null)" />
    </div>
  `,
})
export class ArtifactsPanelComponent {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  leadId = input<string | undefined>(undefined);
  clientId = input<string | undefined>(undefined);
  projectId = input<string | undefined>(undefined);
  networkCompanyId = input<string | undefined>(undefined);
  networkContactId = input<string | undefined>(undefined);
  sectionTitle = input<string>('Attachments');

  constructor() {
    effect(() => {
      const param = this.queryParam;
      if (!param) return;
      untracked(() => void this.load());
    });
  }

  artifacts = signal<Artifact[]>([]);
  error = signal<string | null>(null);
  uploading = signal(false);
  uploadProgress = signal<{ name: string; done: boolean }[]>([]);
  viewerFile = signal<ViewerFile | null>(null);

  files = () => this.artifacts().filter(a => a.type === 'FILE');
  links = () => this.artifacts().filter(a => a.type === 'LINK');
  notes = () => this.artifacts().filter(a => a.type === 'NOTE');

  newLinkTitle = '';
  newLinkUrl = '';
  newNoteTitle = '';
  newNoteContent = '';

  sanitizeHtml(html?: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html ?? '');
  }

  onNoteEditor(quill: Quill) {
    bindQuillPersonCardScope(quill, () => {
      const clientId = this.clientId()?.trim();
      if (clientId) return { type: 'client', clientId };
      return { type: 'crm' };
    });
  }

  private fileExtension(a: Artifact): string {
    return fileExtension(a.fileUrl ?? a.title);
  }

  isImage(a: Artifact): boolean {
    return isRasterImage(a.fileUrl ?? a.title, a.mimeType);
  }

  isPdf(a: Artifact): boolean {
    const mime = a.mimeType ?? '';
    const ext = this.fileExtension(a);
    return mime === 'application/pdf' || ext === 'pdf';
  }

  fileUrl(a: Artifact): string {
    if (!a.fileUrl) return '';
    return resolveAssetUrl(`/api/uploads/${a.fileUrl}`) ?? '';
  }

  openFile(a: Artifact) {
    const url = this.fileUrl(a);
    if (!url) return;
    if (this.isImage(a)) {
      this.viewerFile.set({ name: a.title, kind: 'image', url });
      return;
    }
    if (this.isPdf(a)) {
      this.viewerFile.set({ name: a.title, kind: 'pdf', url });
      return;
    }
    void this.downloadFile(a);
  }

  async downloadFile(a: Artifact, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    const url = this.fileUrl(a);
    if (!url) return;

    this.error.set(null);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = a.title;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Download failed');
    }
  }

  fileExt(a: Artifact): string {
    return fileExtLabel(a.fileUrl ?? a.title);
  }

  fileIcon(a: Artifact): string {
    return fileIconClass(a.fileUrl ?? a.title, a.mimeType);
  }

  private get queryParam() {
    if (this.leadId()) return `leadId=${this.leadId()}`;
    if (this.projectId()) return `projectId=${this.projectId()}`;
    if (this.clientId()) return `clientId=${this.clientId()}`;
    if (this.networkCompanyId()) return `networkCompanyId=${this.networkCompanyId()}`;
    if (this.networkContactId()) return `networkContactId=${this.networkContactId()}`;
    return '';
  }

  private get parentPayload() {
    if (this.leadId()) return { leadId: this.leadId() };
    if (this.projectId()) return { projectId: this.projectId() };
    if (this.clientId()) return { clientId: this.clientId() };
    if (this.networkCompanyId()) return { networkCompanyId: this.networkCompanyId() };
    if (this.networkContactId()) return { networkContactId: this.networkContactId() };
    return {};
  }

  async load() {
    if (!this.queryParam) return;
    try {
      const data = await this.api.get<Artifact[]>(`/artifacts?${this.queryParam}`);
      this.artifacts.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load attachments');
    }
  }

  async uploadFiles(files: File[]) {
    if (!files.length || this.uploading() || !this.queryParam) return;

    this.uploading.set(true);
    this.uploadProgress.set(files.map(f => ({ name: f.name, done: false })));
    this.error.set(null);

    const param = this.queryParam;

    for (const file of files) {
      try {
        await this.api.uploadFile(`/artifacts/upload?${param}`, file);
        this.uploadProgress.update(prev =>
          prev.map(p => p.name === file.name ? { ...p, done: true } : p)
        );
      } catch (err) {
        this.error.set(`Failed to upload "${file.name}": ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    await this.load();
    this.uploading.set(false);
    setTimeout(() => this.uploadProgress.set([]), 2000);
  }

  async addLink() {
    if (!this.newLinkTitle || !this.newLinkUrl) return;
    try {
      await this.api.post('/artifacts', {
        ...this.parentPayload,
        type: 'LINK',
        title: this.newLinkTitle,
        url: this.newLinkUrl,
      });
      this.newLinkTitle = '';
      this.newLinkUrl = '';
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to add link');
    }
  }

  async addNote() {
    if (!this.newNoteTitle || !this.newNoteContent) return;
    try {
      await this.api.post('/artifacts', {
        ...this.parentPayload,
        type: 'NOTE',
        title: this.newNoteTitle,
        content: this.newNoteContent,
      });
      this.newNoteTitle = '';
      this.newNoteContent = '';
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to add note');
    }
  }

  async deleteArtifact(a: Artifact, event?: Event) {
    event?.stopPropagation();
    event?.preventDefault();
    try {
      await this.api.delete(`/artifacts/${a.id}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  formatCreatedDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
