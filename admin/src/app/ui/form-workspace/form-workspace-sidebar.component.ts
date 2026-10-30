import { CdkDrag, CdkDragDrop, CdkDragPlaceholder, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { NgClass } from '@angular/common';
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
  imports: [NgClass, FormsModule, RouterLink, RouterLinkActive, ButtonModule, InputTextModule, AppDialogModule, CdkDropList, CdkDrag, CdkDragPlaceholder],
  template: `
    <nav class="tm-sidebar" aria-label="Form">
      @if (ws.form(); as f) {
        @let c = ws.config();
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
                <a [routerLink]="c?.base" [queryParams]="{ view: s.id }" class="tm-nav-link" [class.active]="isView(s.id)" [title]="s.name" draggable="false">
                  @if (f.canEdit) {
                    <span class="fw-drag-handle" aria-hidden="true"><i class="pi pi-bars"></i></span>
                  } @else {
                    <span class="fw-drag-handle" aria-hidden="true"></span>
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

        <ul class="tm-nav fw-tools">
          @for (t of c?.tools ?? []; track t.id) {
            <li>
              @if (t.route) {
                <a [routerLink]="t.route" routerLinkActive="active" class="tm-nav-link">
                  <i class="pi" [ngClass]="t.icon"></i><span>{{ t.label }}</span>
                </a>
              } @else {
                <a [routerLink]="c?.base" [queryParams]="{ view: t.id }" class="tm-nav-link" [class.active]="isView(t.id)">
                  <i class="pi" [ngClass]="t.icon"></i><span>{{ t.label }}</span>
                </a>
              }
            </li>
          }
        </ul>
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
    .fw-tools {
      border-top: 1px solid var(--tm-border);
      margin-top: 0.5rem;
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
    /* A drag handle on hover, in the same column as the icons below (Settings, Scoring, …). The whole row drags. */
    .fw-drag-handle {
      width: 1.1rem;
      flex-shrink: 0;
      text-align: center;
      color: var(--drag-handle-color);
      font-size: var(--fs-sm);
      opacity: 0;
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

  /** Whether the form page shows this view (?view=…; default: the first section, or the config's empty view). */
  isView(view: string) {
    const f = this.ws.form();
    const c = this.ws.config();
    if (!f || !c) return false;
    const url = new URL(this.router.url, 'http://x');
    if (url.pathname.replace(/\/$/, '') !== c.base.join('/').replace(/^\/*/, '/')) return false;
    const current = url.searchParams.get('view') ?? (f.sections[0]?.id ?? c.emptyView);
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
      await this.ws.reorderSections(sections.map((s) => s.id));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not reorder', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
      await this.ws.reload();
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
      const id = await this.ws.addSection(name);
      this.addVisible = false;
      await this.router.navigate(this.ws.config()?.base ?? ['/forms', f.id], { queryParams: { view: id } });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add section', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.adding.set(false);
    }
  }
}
