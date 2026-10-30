import { Injectable, signal } from '@angular/core';
import type { FormSectionDto } from '@upstart/back-office/shared';

/** What the workspace sidebar needs of the open form (Forms' and Care's forms both fit). */
export type WorkspaceForm = { id: string; canEdit: boolean; sections: FormSectionDto[] };

/** A sidebar entry below the sections: a view of the form page (?view=id), or its own page (`route`). */
export type WorkspaceTool = { id: string; label: string; icon: string; route?: unknown[] };

/** How the open module's form behaves in the workspace: where it lives, its tools, and its API. */
export type WorkspaceConfig = {
  /** The form page, e.g. ['/forms', id] or ['/care/forms', id]. */
  base: unknown[];
  tools: WorkspaceTool[];
  /** The view shown when the URL has none and the form has no sections. */
  emptyView: string;
  load(): Promise<WorkspaceForm>;
  addSection(name: string): Promise<string>;
  reorderSections(ids: string[]): Promise<void>;
};

/**
 * The form workspace (Forms → a form, Care → Customize form): collapsed main menu plus a column with the
 * form's sections and its tools. The open page sets `config` and `form`; the sidebar lists and changes sections.
 */
@Injectable({ providedIn: 'root' })
export class FormWorkspaceService {
  /** The form open in the workspace (set by the page). */
  readonly form = signal<WorkspaceForm | null>(null);
  readonly config = signal<WorkspaceConfig | null>(null);
  /** Bumped after the sidebar changes the form, so the open page reloads it. */
  readonly changed = signal(0);

  /** A page opening `formId`: clear another form still showing until this one loads. */
  open(formId: string, config: WorkspaceConfig) {
    if (this.form()?.id !== formId) this.form.set(null);
    this.config.set(config);
  }

  async reload() {
    const c = this.config();
    if (c) this.form.set(await c.load());
  }

  /** Save a new section order (drag and drop in the sidebar); the open page reloads. */
  async reorderSections(ids: string[]) {
    await this.config()?.reorderSections(ids);
    this.changed.update((n) => n + 1);
  }

  /** Add a section and return its id. */
  async addSection(name: string): Promise<string> {
    const c = this.config();
    if (!c) throw new Error('No form is open');
    const id = await c.addSection(name);
    await this.reload();
    this.changed.update((n) => n + 1);
    return id;
  }
}
