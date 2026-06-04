import { Component, inject, input, OnInit, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TabsModule } from 'primeng/tabs';
import { MessageModule } from 'primeng/message';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';

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

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);

@Component({
  selector: 'app-artifacts-panel',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TabsModule, MessageModule, QuillModule],
  template: `
    <div class="card">
      <h3 class="showcase-section-title mb-3">Attachments</h3>

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
            <div class="artifact-add-row">
              <input type="file" multiple #fileInput style="display:none" (change)="onFilesSelected($event)" />
              <button pButton label="Upload Files" icon="pi pi-upload" severity="secondary" (click)="fileInput.click()" [loading]="uploading()"></button>
              @if (uploadProgress().length) {
                <div class="artifact-upload-progress">
                  @for (p of uploadProgress(); track p.name) {
                    <span class="artifact-upload-item">
                      <i class="pi" [class.pi-check]="p.done" [class.pi-spin]="!p.done" [class.pi-spinner]="!p.done"></i>
                      {{ p.name }}
                    </span>
                  }
                </div>
              }
            </div>

            <div class="artifact-card-grid">
              @for (a of files(); track a.id) {
                <div class="artifact-file-card">
                  <button
                    class="artifact-card-delete"
                    pButton icon="pi pi-trash"
                    [rounded]="true" [text]="true" severity="danger" size="small"
                    (click)="deleteArtifact(a)"
                  ></button>
                  <a [href]="fileHref(a)" target="_blank" class="artifact-file-card-inner">
                    @if (isImage(a)) {
                      <img [src]="fileHref(a)" [alt]="a.title" class="artifact-file-thumb" />
                    } @else {
                      <div class="artifact-file-icon-wrap">
                        <i class="pi {{ fileIcon(a) }} artifact-file-icon"></i>
                        <span class="artifact-file-ext">{{ fileExt(a) }}</span>
                      </div>
                    }
                    <div class="artifact-file-name">{{ a.title }}</div>
                  </a>
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
              ></quill-editor>
              <button pButton label="Add Note" icon="pi pi-plus" severity="secondary" (click)="addNote()" [disabled]="!newNoteTitle || !newNoteContent"></button>
            </div>
            <div class="artifact-list">
              @for (a of notes(); track a.id) {
                <div class="artifact-item artifact-item--note">
                  <div class="artifact-item-header">
                    <span class="artifact-title">{{ a.title }}</span>
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
    </div>
  `,
})
export class ArtifactsPanelComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly sanitizer = inject(DomSanitizer);

  leadId = input<string | undefined>(undefined);
  clientId = input<string | undefined>(undefined);

  artifacts = signal<Artifact[]>([]);
  error = signal<string | null>(null);
  uploading = signal(false);
  uploadProgress = signal<{ name: string; done: boolean }[]>([]);

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

  isImage(a: Artifact): boolean {
    if (a.mimeType && IMAGE_TYPES.has(a.mimeType)) return true;
    const ext = (a.fileUrl ?? '').split('.').pop()?.toLowerCase() ?? '';
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
  }

  fileHref(a: Artifact): string {
    return `/api/uploads/${a.fileUrl}`;
  }

  fileExt(a: Artifact): string {
    return ((a.fileUrl ?? a.title).split('.').pop() ?? '').toUpperCase().slice(0, 4);
  }

  fileIcon(a: Artifact): string {
    const mime = a.mimeType ?? '';
    const ext = (a.fileUrl ?? '').split('.').pop()?.toLowerCase() ?? '';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pi-file-pdf';
    if (mime.startsWith('video/')) return 'pi-video';
    if (mime.startsWith('audio/')) return 'pi-volume-up';
    if (['doc', 'docx'].includes(ext)) return 'pi-file-word';
    if (['xls', 'xlsx'].includes(ext)) return 'pi-file-excel';
    return 'pi-file';
  }

  async ngOnInit() {
    await this.load();
  }

  private get queryParam() {
    if (this.leadId()) return `leadId=${this.leadId()}`;
    if (this.clientId()) return `clientId=${this.clientId()}`;
    return '';
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

  async onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length) return;

    this.uploading.set(true);
    this.uploadProgress.set(files.map(f => ({ name: f.name, done: false })));
    this.error.set(null);

    const param = this.leadId() ? `leadId=${this.leadId()}` : `clientId=${this.clientId()}`;

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
    input.value = '';
    setTimeout(() => this.uploadProgress.set([]), 2000);
  }

  async addLink() {
    if (!this.newLinkTitle || !this.newLinkUrl) return;
    try {
      await this.api.post('/artifacts', {
        ...(this.leadId() ? { leadId: this.leadId() } : { clientId: this.clientId() }),
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
        ...(this.leadId() ? { leadId: this.leadId() } : { clientId: this.clientId() }),
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

  async deleteArtifact(a: Artifact) {
    try {
      await this.api.delete(`/artifacts/${a.id}`);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  formatSize(bytes?: number): string {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
