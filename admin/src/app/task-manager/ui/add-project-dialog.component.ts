import { Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TmApiService } from '../core/tm-api.service';
import { PROJECT_COLORS } from '../core/tm-format.util';
import { TmProject } from '../core/tm.types';
import { LucideIconPickerComponent } from '@upstart/back-office/lucide-icons';

type Available = { id: string; name: string; client: { id: string; name: string } | null; label: string };

/** Add an existing project (created on the Projects page) to Tasks. */
@Component({
  selector: 'app-tm-add-project-dialog',
  standalone: true,
  imports: [LucideIconPickerComponent, FormsModule, RouterLink, AppDialogModule, ButtonModule, SelectModule, MessageModule],
  template: `
    <p-dialog header="Add project to Tasks" [(visible)]="visible" [modal]="true" [style]="{ width: '30rem' }" (onShow)="onShow()" [draggable]="false">
      <form (ngSubmit)="add()">
        <div class="form-field mb-3">
          <label for="tm-add-project">Project</label>
          <p-select
            inputId="tm-add-project"
            name="projectId"
            [options]="available()"
            optionLabel="label"
            optionValue="id"
            [(ngModel)]="projectId"
            [filter]="true"
            filterBy="label"
            [loading]="loading()"
            placeholder="Choose a project"
            emptyMessage="Every active project is already in Tasks"
            styleClass="w-full"
            appendTo="body"
          />
          <small class="tm-muted tm-field-hint">
            Only existing projects can be added. Create new ones on the
            <a routerLink="/projects" (click)="visible.set(false)">Projects</a> page.
          </small>
        </div>
        <div class="form-field mb-3">
          <label>Color</label>
          <div class="tm-color-swatches tm-color-swatches--row">
            @for (c of colors; track c) {
              <button type="button" class="tm-color-swatch" [class.selected]="color === c" [style.background]="c" (click)="color = c" [attr.aria-label]="'Color ' + c" [attr.aria-pressed]="color === c"></button>
            }
          </div>
        </div>
        <div class="form-field mb-3">
          <label>Icon <span class="tm-muted">(optional)</span></label>
          <nmp-lucide-icon-picker name="icon" [(ngModel)]="icon" />
        </div>
        @if (error()) {
          <p-message severity="error" [text]="error()!" class="mb-3" />
        }
        <div class="form-actions">
          <button type="button" pButton label="Cancel" severity="secondary" (click)="visible.set(false)"></button>
          <button type="submit" pButton label="Add to Tasks" [loading]="saving()" [disabled]="!projectId || saving()"></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class TmAddProjectDialogComponent {
  private readonly tm = inject(TmApiService);

  visible = model(false);
  added = output<TmProject>();

  readonly colors = PROJECT_COLORS;
  available = signal<Available[]>([]);
  loading = signal(false);
  projectId: string | null = null;
  color = PROJECT_COLORS[0];
  icon: string | null = null;
  saving = signal(false);
  error = signal<string | null>(null);

  async onShow() {
    this.projectId = null;
    this.icon = null;
    this.color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    this.error.set(null);
    this.loading.set(true);
    try {
      const list = await this.tm.availableProjects();
      this.available.set(list.map((p) => ({ ...p, label: p.client ? `${p.name} — ${p.client.name}` : p.name })));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      this.loading.set(false);
    }
  }

  async add() {
    if (!this.projectId) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const project = await this.tm.addProject(this.projectId, this.color, this.icon);
      this.visible.set(false);
      this.added.emit(project);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not add project');
    } finally {
      this.saving.set(false);
    }
  }
}
