import { inject, Injectable, signal } from '@angular/core';
import type { FreeFormDto } from '@upstart/back-office/shared';
import { FormsApi } from './forms.api';

/**
 * The form workspace (Forms → a form): shared between the form pages and the workspace sidebar in the shell.
 * The open page sets the form; the sidebar lists its sections and can add one.
 */
@Injectable({ providedIn: 'root' })
export class FormWorkspaceService {
  private readonly forms = inject(FormsApi);

  /** The form open in the workspace (set by the form pages). */
  readonly form = signal<FreeFormDto | null>(null);
  /** Bumped after the sidebar changes the form, so the open page reloads it. */
  readonly changed = signal(0);

  async reload(id: string) {
    this.form.set(await this.forms.form(id));
  }

  /** Save a new section order (drag and drop in the sidebar); the open page reloads. */
  async reorderSections(formId: string, ids: string[]) {
    await this.forms.reorderSections(formId, ids);
    this.changed.update((n) => n + 1);
  }

  /** Add a section and return its id. */
  async addSection(formId: string, name: string): Promise<string> {
    const s = await this.forms.addSection(formId, name);
    await this.reload(formId);
    this.changed.update((n) => n + 1);
    return s.id;
  }
}
