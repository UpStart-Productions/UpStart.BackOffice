import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TmApiService } from '../core/tm-api.service';
import { PROJECT_COLORS } from '../core/tm-format.util';
import { TmProject } from '../core/tm.types';
import { LucideIconPickerComponent } from '@upstart/back-office/lucide-icons';

/** Edit a Task Manager project name, color and icon. */
@Component({
  selector: 'app-tm-edit-project-dialog',
  standalone: true,
  imports: [FormsModule, AppDialogModule, ButtonModule, InputTextModule, SelectModule, MessageModule, LucideIconPickerComponent],
  template: `
    <p-dialog
      header="Edit project"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '30rem' }"
      [draggable]="false"
      (onShow)="syncFromProject()"
    >
      <form (ngSubmit)="save()">
        <div class="form-field mb-3">
          <label for="tm-edit-project-link">Project</label>
          <p-select
            inputId="tm-edit-project-link"
            name="linkedProject"
            [options]="[projectLinkOption()]"
            optionLabel="label"
            optionValue="id"
            [ngModel]="project().id"
            [disabled]="true"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
        <div class="form-field mb-3">
          <label for="tm-edit-project-name">Name</label>
          <input pInputText id="tm-edit-project-name" name="name" class="w-full" [(ngModel)]="name" required maxlength="200" />
        </div>
        <div class="form-field mb-3">
          <label>Color</label>
          <div class="tm-color-swatches tm-color-swatches--row">
            @for (c of colors; track c) {
              <button
                type="button"
                class="tm-color-swatch"
                [class.selected]="color === c"
                [style.background]="c"
                (click)="color = c"
                [attr.aria-label]="'Color ' + c"
                [attr.aria-pressed]="color === c"
              ></button>
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
          <button type="submit" pButton label="Save" [loading]="saving()" [disabled]="!name.trim() || saving()"></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class TmEditProjectDialogComponent {
  private readonly tm = inject(TmApiService);

  visible = model(false);
  project = input.required<TmProject>();
  updated = output<TmProject>();

  readonly colors = PROJECT_COLORS;
  name = '';
  color = PROJECT_COLORS[0];
  icon: string | null = null;
  saving = signal(false);
  error = signal<string | null>(null);

  projectLinkOption() {
    const p = this.project();
    const label = p.client ? `${p.name} — ${p.client.name}` : p.name;
    return { id: p.id, label };
  }

  syncFromProject() {
    const p = this.project();
    this.name = p.name;
    this.color = p.color || PROJECT_COLORS[0];
    this.icon = p.icon;
    this.error.set(null);
  }

  async save() {
    const p = this.project();
    const trimmed = this.name.trim();
    if (!trimmed) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const updated = await this.tm.updateProject(p.id, {
        name: trimmed,
        color: this.color,
        icon: this.icon,
      });
      this.visible.set(false);
      this.updated.emit(updated);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not save project');
    } finally {
      this.saving.set(false);
    }
  }
}
