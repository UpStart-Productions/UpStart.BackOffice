import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { AppDialogModule } from '../../core/app-dialog.module';
import { FormWorkspaceService } from '../../core/form-workspace.service';

/**
 * The form workspace's left column (like the Task Manager sidebar, same styles): Settings, Scoring, the form's
 * sections, Links and Submissions. The form page shows the picked item (?view=settings | scoring | links | section id).
 */
@Component({
  selector: 'app-form-workspace-sidebar',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterLinkActive, ButtonModule, InputTextModule, AppDialogModule, CdkDropList, CdkDrag, CdkDragPlaceholder],
  template: `
    <nav class="tm-sidebar" aria-label="Form">
      @if (ws.form(); as f) {
        <a routerLink="/forms" class="tm-nav-link fw-back"><i class="pi pi-arrow-left"></i><span>All forms</span></a>
        <div class="fw-title" [title]="f.name">{{ f.name }}</div>
        <ul class="tm-nav">
          <li>
            <a [routerLink]="['/forms', f.id]" [queryParams]="{ view: 'settings' }" class="tm-nav-link" [class.active]="isView('settings')">
              <i class="pi pi-cog"></i><span>Settings</span>
            </a>
          </li>
          <li>
            <a [routerLink]="['/forms', f.id]" [queryParams]="{ view: 'scoring' }" class="tm-nav-link" [class.active]="isView('scoring')">
              <i class="pi pi-chart-bar"></i><span>Scoring</span>
            </a>
          </li>
          <li>
            <a [routerLink]="['/forms', f.id]" [queryParams]="{ view: 'links' }" class="tm-nav-link" [class.active]="isView('links')">
              <i class="pi pi-link"></i><span>Links</span>
            </a>
          </li>
          <li>
            <a [routerLink]="['/forms', f.id, 'submissions']" routerLinkActive="active" class="tm-nav-link">
              <i class="pi pi-inbox"></i><span>Submissions</span>
            </a>
          </li>
        </ul>

        <div class="fw-sections">
          <div class="tm-nav-group-header-row">
            <span class="tm-nav-group-header">Sections</span>
            @if (f.canEdit) {
              <button type="button" class="tm-icon-btn" (click)="openAdd()" title="Add a section" aria-label="Add a section">
                <i class="pi pi-plus"></i>
              </button>
            }
          </div>
          <ul
            class="tm-nav fw-section-list"
            cdkDropList
            cdkDropListLockAxis="y"
            [cdkDropListDisabled]="!f.canEdit"
            (cdkDropListDropped)="dropSection($event)"
          >
            @for (s of f.sections; track s.id; let i = $index) {
              <li cdkDrag [cdkDragData]="s" class="fw-section-item" [class.fw-draggable]="f.canEdit">
                <!-- The whole row drags (a click still opens it); draggable=false stops the browser's own link dragging. -->
                <a [routerLink]="['/forms', f.id]" [queryParams]="{ view: s.id }" class="tm-nav-link" [class.active]="isView(s.id)" [title]="s.name" draggable="false">
                  @if (f.canEdit) {
                    <span class="fw-drag-handle" aria-hidden="true"><i class="pi pi-bars"></i></span>
                  }
                  <span class="fw-num">{{ i + 1 }}</span>
                  <span class="tm-nav-label">{{ s.name }}</span>
                  <span class="fw-count">{{ s.fields.length }}</span>
                </a>
                <div class="fw-drag-placeholder" *cdkDragPlaceholder></div>
              </li>
            } @empty {
              <li class="tm-nav-empty">No sections yet{{ f.canEdit ? ', use + to add one' : '' }}</li>
            }
          </ul>
        </div>
      }
    </nav>

    <p-dialog header="Add section" [(visible)]="addVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
      <div class="form-field">
        <label for="fwSectionName">Name</label>
        <input pInputText id="fwSectionName" class="w-full" [(ngModel)]="newName" (keydown.enter)="add()" />
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="adding()" (onClick)="addVisible = false" />
        <p-button label="Add" icon="pi pi-plus" [loading]="adding()" [disabled]="!newName.trim()" (onClick)="add()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .fw-back {
      color: var(--text-color-secondary);
    }
    .fw-title {
      font-weight: 600;
      padding: 0.25rem 0.65rem 0.5rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .fw-sections {
      border-top: 1px solid var(--tm-border);
      padding-top: 0.5rem;
    }
    .fw-num {
      color: var(--text-color-secondary);
      width: 1.1rem;
      text-align: center;
      flex-shrink: 0;
    }
    .fw-draggable {
      cursor: grab;
    }
    .fw-drag-handle {
      color: var(--text-color-secondary);
      opacity: 0;
      margin-left: -0.35rem;
      font-size: var(--fs-sm);
    }
    .fw-section-item:hover .fw-drag-handle,
    .cdk-drag-preview .fw-drag-handle {
      opacity: 1;
    }
    /* The drop slot: same look as a task row's drop slot in Tasks. */
    .fw-drag-placeholder {
      min-height: 2.25rem;
      margin: 0.1rem 0;
      border: 1px dashed var(--brand-primary);
      border-radius: 6px;
      background: var(--tm-selected);
    }
    .fw-section-list.cdk-drop-list-dragging .tm-nav-link {
      pointer-events: none;
    }
    .cdk-drag-preview.fw-section-item {
      list-style: none;
      background: var(--surface-card);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
    }
    .fw-section-list.cdk-drop-list-dragging .fw-section-item:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .fw-count {
      margin-left: auto;
      color: var(--text-color-secondary);
    }
  `,
})
export class FormWorkspaceSidebarComponent {
  readonly ws = inject(FormWorkspaceService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  addVisible = false;
  newName = '';
  adding = signal(false);

  /** Whether the page shows this view (?view=…; default: the first section, or Settings). */
  isView(view: string) {
    const f = this.ws.form();
    if (!f || this.router.url.includes('/submissions')) return false;
    const current = new URL(this.router.url, 'http://x').searchParams.get('view') ?? (f.sections[0]?.id ?? 'settings');
    return current === view;
  }

  /** Drag and drop a section to a new place (☰ handle, like Tasks). Shows the new order right away. */
  async dropSection(event: CdkDragDrop<unknown>) {
    const f = this.ws.form();
    if (!f || event.previousIndex === event.currentIndex) return;
    const sections = [...f.sections];
    moveItemInArray(sections, event.previousIndex, event.currentIndex);
    this.ws.form.set({ ...f, sections });
    try {
      await this.ws.reorderSections(f.id, sections.map((s) => s.id));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not reorder', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
      await this.ws.reload(f.id);
    }
  }

  openAdd() {
    this.newName = '';
    this.addVisible = true;
  }

  async add() {
    const f = this.ws.form();
    const name = this.newName.trim();
    if (!f || !name) return;
    this.adding.set(true);
    try {
      const id = await this.ws.addSection(f.id, name);
      this.addVisible = false;
      await this.router.navigate(['/forms', f.id], { queryParams: { view: id } });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add section', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.adding.set(false);
    }
  }
}
