import {
  Component, inject, input, OnInit, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { TabsModule } from 'primeng/tabs';
import { MessageModule } from 'primeng/message';
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

@Component({
  selector: 'app-artifacts-panel',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TextareaModule, TabsModule, MessageModule],
  template: `
    <div class="card">
      <h3 class="showcase-section-title mb-3">Attachments</h3>

      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      }

      <p-tabs>
        <!-- FILES -->
        <p-tab value="files">
          <ng-template pTemplate="header"><i class="pi pi-paperclip"></i>&nbsp;Files</ng-template>
          <div class="artifact-list">
            @for (a of files(); track a.id) {
              <div class="artifact-item">
                <div class="artifact-item-info">
                  <a class="artifact-title" [href]="'/api/uploads/' + a.fileUrl" target="_blank">{{ a.title }}</a>
                  <span class="artifact-meta">{{ formatSize(a.fileSize) }} · {{ a.mimeType }}</span>
                </div>
                <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="deleteArtifact(a)" />
              </div>
            }
            @if (files().length === 0) {
              <p class="artifact-empty">No files attached yet.</p>
            }
          </div>
          <div class="artifact-add-row">
            <input type="file" #fileInput style="display:none" (change)="onFileSelected($event)" />
            <p-button label="Upload File" icon="pi pi-upload" severity="secondary" (onClick)="fileInput.click()" [loading]="uploading()" />
          </div>
        </p-tab>

        <!-- LINKS -->
        <p-tab value="links">
          <ng-template pTemplate="header"><i class="pi pi-link"></i>&nbsp;Links</ng-template>
          <div class="artifact-list">
            @for (a of links(); track a.id) {
              <div class="artifact-item">
                <div class="artifact-item-info">
                  <a class="artifact-title" [href]="a.url" target="_blank">{{ a.title }}</a>
                  <span class="artifact-meta">{{ a.url }}</span>
                </div>
                <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="deleteArtifact(a)" />
              </div>
            }
            @if (links().length === 0) {
              <p class="artifact-empty">No links yet.</p>
            }
          </div>
          <div class="artifact-add-form">
            <input pInputText [(ngModel)]="newLinkTitle" placeholder="Title" class="w-full" />
            <input pInputText [(ngModel)]="newLinkUrl" placeholder="https://..." class="w-full" />
            <p-button label="Add Link" icon="pi pi-plus" severity="secondary" (onClick)="addLink()" [disabled]="!newLinkTitle || !newLinkUrl" />
          </div>
        </p-tab>

        <!-- NOTES -->
        <p-tab value="notes">
          <ng-template pTemplate="header"><i class="pi pi-file-edit"></i>&nbsp;Notes</ng-template>
          <div class="artifact-list">
            @for (a of notes(); track a.id) {
              <div class="artifact-item artifact-item--note">
                <div class="artifact-item-header">
                  <span class="artifact-title">{{ a.title }}</span>
                  <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="deleteArtifact(a)" />
                </div>
                <p class="artifact-note-content">{{ a.content }}</p>
              </div>
            }
            @if (notes().length === 0) {
              <p class="artifact-empty">No notes yet.</p>
            }
          </div>
          <div class="artifact-add-form">
            <input pInputText [(ngModel)]="newNoteTitle" placeholder="Note title" class="w-full" />
            <textarea pTextarea [(ngModel)]="newNoteContent" placeholder="Note content..." class="w-full" rows="4"></textarea>
            <p-button label="Add Note" icon="pi pi-plus" severity="secondary" (onClick)="addNote()" [disabled]="!newNoteTitle || !newNoteContent" />
          </div>
        </p-tab>
      </p-tabs>
    </div>
  `,
})
export class ArtifactsPanelComponent implements OnInit {
  private readonly api = inject(ApiService);

  leadId = input<string | undefined>(undefined);
  clientId = input<string | undefined>(undefined);

  artifacts = signal<Artifact[]>([]);
  error = signal<string | null>(null);
  uploading = signal(false);

  files = () => this.artifacts().filter(a => a.type === 'FILE');
  links = () => this.artifacts().filter(a => a.type === 'LINK');
  notes = () => this.artifacts().filter(a => a.type === 'NOTE');

  newLinkTitle = '';
  newLinkUrl = '';
  newNoteTitle = '';
  newNoteContent = '';

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

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploading.set(true);
    try {
      const param = this.leadId() ? `leadId=${this.leadId()}` : `clientId=${this.clientId()}`;
      await this.api.uploadFile(`/artifacts/upload?${param}`, file);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Upload failed');
    } finally { this.uploading.set(false); input.value = ''; }
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
