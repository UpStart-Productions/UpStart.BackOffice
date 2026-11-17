import { Component, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TmApiService } from '../core/tm-api.service';
import { PROJECT_COLORS } from '../core/tm-format.util';
import { TmProject } from '../core/tm.types';
import { LucideIconPickerComponent } from '@upstart/back-office/lucide-icons';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

type HostOption = { id: string; name: string; client: { id: string; name: string } | null; label: string };

/** New task board: optional Office project, then a board name. */
@Component({
  selector: 'app-tm-add-project-dialog',
  standalone: true,
  imports: [
    LucideIconPickerComponent,
    FormsModule,
    AppDialogModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    MessageModule,
    HelpTextComponent,
  ],
  template: `
    <p-dialog
      header="New task board"
      [(visible)]="visible"
      [modal]="true"
      [style]="{ width: '30rem' }"
      (onShow)="onShow()"
      [draggable]="false"
    >
      <form (ngSubmit)="submit()">
        <div class="form-field mb-3">
          <label for="tm-board-host">Project <app-help-text key="tm.newBoardProject" /></label>
          <p-select
            inputId="tm-board-host"
            name="hostProjectId"
            [options]="hosts()"
            optionLabel="label"
            optionValue="id"
            [(ngModel)]="hostProjectId"
            [filter]="true"
            filterBy="label"
            [showClear]="true"
            [loading]="loadingHosts()"
            placeholder="None — standalone board"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
        <div class="form-field mb-3">
          <label for="tm-board-name">Board name <app-help-text key="tm.newBoardName" /></label>
          <input
            pInputText
            id="tm-board-name"
            name="boardName"
            class="w-full"
            [(ngModel)]="name"
            required
            maxlength="200"
            placeholder="e.g. Yard work"
          />
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
          <button type="submit" pButton label="Create board" [loading]="saving()" [disabled]="!canSubmit() || saving()"></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class TmAddProjectDialogComponent {
  private readonly tm = inject(TmApiService);

  visible = model(false);
  /** Pre-select the Office project (e.g. Add another board). */
  presetHostProjectId = input<string | null>(null);
  added = output<TmProject>();

  readonly colors = PROJECT_COLORS;
  hosts = signal<HostOption[]>([]);
  loadingHosts = signal(false);
  hostProjectId: string | null = null;
  name = '';
  color = PROJECT_COLORS[0];
  icon: string | null = null;
  saving = signal(false);
  error = signal<string | null>(null);

  canSubmit(): boolean {
    return !!this.name.trim();
  }

  async onShow() {
    this.hostProjectId = this.presetHostProjectId();
    this.name = '';
    this.icon = null;
    this.color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    this.error.set(null);
    this.loadingHosts.set(true);
    try {
      const hostList = await this.tm.boardHosts();
      this.hosts.set(hostList.map((p) => ({ ...p, label: p.client ? `${p.name} — ${p.client.name}` : p.name })));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      this.loadingHosts.set(false);
    }
  }

  async submit() {
    const trimmed = this.name.trim();
    if (!trimmed) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const project = await this.tm.createBoard({
        name: trimmed,
        color: this.color,
        icon: this.icon,
        hostProjectId: this.hostProjectId,
      });
      this.visible.set(false);
      this.added.emit(project);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not create board');
    } finally {
      this.saving.set(false);
    }
  }
}