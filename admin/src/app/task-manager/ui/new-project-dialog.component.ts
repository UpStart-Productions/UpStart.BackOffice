import { Component, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { TmApiService } from '../core/tm-api.service';
import { PROJECT_COLORS } from '../core/tm-format.util';
import { TmProject } from '../core/tm.types';

/** Quick-create a Task Manager project (name, optional client, color). Billing settings live on the project's Settings tab. */
@Component({
  selector: 'app-tm-new-project-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule, SelectModule, MessageModule],
  template: `
    <p-dialog header="New project" [(visible)]="visible" [modal]="true" [style]="{ width: '28rem' }" (onShow)="onShow()" [draggable]="false">
      <form (ngSubmit)="create()" class="flex flex-column gap-3">
        @if (error()) {
          <p-message severity="error" [text]="error()!" />
        }
        <div class="form-field">
          <label for="tm-new-project-name">Project name</label>
          <input pInputText id="tm-new-project-name" name="name" [(ngModel)]="name" class="w-full" autocomplete="off" />
        </div>
        <div class="form-field">
          <label for="tm-new-project-client">Client</label>
          <p-select
            inputId="tm-new-project-client"
            name="clientId"
            [options]="clients()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="clientId"
            [showClear]="true"
            [filter]="true"
            placeholder="None (personal / internal)"
            styleClass="w-full"
            appendTo="body"
          />
        </div>
        <div class="form-field">
          <label>Color</label>
          <div class="tm-color-swatches">
            @for (c of colors; track c) {
              <button type="button" class="tm-color-swatch" [class.selected]="color === c" [style.background]="c" (click)="color = c" [attr.aria-label]="'Color ' + c"></button>
            }
          </div>
        </div>
        <div class="flex justify-content-end gap-2 mt-2">
          <p-button label="Cancel" severity="secondary" [text]="true" type="button" (onClick)="visible.set(false)" />
          <p-button label="Create project" type="submit" [loading]="saving()" [disabled]="!name.trim()" />
        </div>
      </form>
    </p-dialog>
  `,
})
export class TmNewProjectDialogComponent {
  private readonly api = inject(ApiService);
  private readonly tm = inject(TmApiService);

  visible = model(false);
  created = output<TmProject>();

  readonly colors = PROJECT_COLORS;
  clients = signal<{ id: string; name: string }[]>([]);
  name = '';
  clientId: string | null = null;
  color = PROJECT_COLORS[0];
  saving = signal(false);
  error = signal<string | null>(null);

  async onShow() {
    this.name = '';
    this.clientId = null;
    this.color = PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
    this.error.set(null);
    queueMicrotask(() => document.getElementById('tm-new-project-name')?.focus());
    if (!this.clients().length) {
      try {
        const list = await this.api.get<{ id: string; name: string; isActive: boolean }[]>('/clients');
        this.clients.set(list.filter((c) => c.isActive));
      } catch {
        /* client list is optional */
      }
    }
  }

  async create() {
    if (!this.name.trim()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const project = await this.tm.createProject({ name: this.name.trim(), clientId: this.clientId, color: this.color });
      this.visible.set(false);
      this.created.emit(project);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not create project');
    } finally {
      this.saving.set(false);
    }
  }
}
