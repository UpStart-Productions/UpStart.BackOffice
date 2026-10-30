import { Component, computed, effect, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { QuillModule } from 'ngx-quill';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { CARE_FORM_MODULE, formProfile, type CareFormDto, type FormAccess, type FormDefinition } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { FormWorkspaceService, type WorkspaceConfig } from '../../core/form-workspace.service';
import { downloadFormFile, readFormFile } from '../../core/form-file.util';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { SingleFileDropzoneComponent } from '../../ui/single-file-dropzone/single-file-dropzone.component';
import { CareApi } from '../../core/care.api';
import { CARE_KIND_LIST_TITLE, CARE_KIND_ROUTE } from '../../ui/care-forms/care.types';
import { FormBuilderComponent } from '../../ui/form-builder/form-builder.component';
import { FormLinksComponent } from '../../ui/form-builder/form-links.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';

type Level = 'none' | 'read' | 'edit';

/** Customize form (from Care → Intake or Care profiles, Setup only): name, who can use it, sections and fields, and (Intake) public links. */
@Component({
  selector: 'app-care-form-edit-page',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    TableModule,
    QuillModule,
    FormLinksComponent,
    FormBuilderComponent,
    HelpTextComponent,
    PageComponent,
    AppDialogModule,
    RowActionsMenuComponent,
    SingleFileDropzoneComponent,
  ],
  template: `
    <app-page [title]="'Customize ' + (form()?.name ?? 'form')" [backLink]="backLink()" [backLabel]="'Back to ' + backLabel()" helpKey="care.form.page">
      @if (form()) {
        <ng-container ngProjectAs="[pageActions]">
          <app-row-actions-menu [items]="headerActions" ariaLabel="Form actions" />
          @if (view() === 'settings' || view() === 'access' || isDirty()) {
            <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
          }
        </ng-container>
      }
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      @if (form(); as f) {
        <div class="stack">
          @switch (view()) {
            @case ('settings') {
              <div class="card">
                <div class="showcase-flex-col">
                  <div class="form-field">
                    <label for="cfName">Name</label>
                    <input pInputText id="cfName" class="w-full" [(ngModel)]="name" />
                  </div>
                  <div class="form-field">
                    <label for="cfDesc">Description <app-help-text key="care.form.description" /></label>
                    <quill-editor
                      id="cfDesc"
                      [(ngModel)]="description"
                      placeholder="What this form is for…"
                      [styles]="{ 'min-height': '120px' }"
                    ></quill-editor>
                  </div>
                </div>
              </div>
            }
            @case ('access') {
              <div class="card">
                <div class="card-header">
                  <h3 class="card-title">Who can use it <app-help-text key="care.form.access" /></h3>
                </div>
                <p-table [value]="roles()" styleClass="table-bordered">
                  <ng-template pTemplate="header">
                    <tr><th>Role</th><th>Access</th></tr>
                  </ng-template>
                  <ng-template pTemplate="body" let-r>
                    <tr>
                      <td>{{ r.name }}</td>
                      <td>
                        <p-selectbutton
                          [options]="levelOptions"
                          optionLabel="label"
                          optionValue="value"
                          [ngModel]="levels()[r.id] ?? 'none'"
                          (ngModelChange)="setLevel(r.id, $event)"
                          [allowEmpty]="false"
                          size="small"
                        />
                      </td>
                    </tr>
                  </ng-template>
                  <ng-template pTemplate="emptymessage">
                    <tr><td colspan="2">No roles yet.</td></tr>
                  </ng-template>
                </p-table>
              </div>
            }
            @case ('links') {
              <div class="card">
                <app-form-links apiBase="/care" [formId]="f.id" title="Public intake links" helpKey="care.links.intake" />
              </div>
            }
            @default {
              @if (currentSection(); as sec) {
                <div class="card">
                  <app-form-builder [form]="f" [profile]="profile()" apiBase="/care" [sectionId]="sec.id" (changed)="reload()" />
                </div>
              }
            }
          }
        </div>
      }
      <p-dialog header="Import form file" [(visible)]="importVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <p class="mt-0">Adds the file's sections and fields after this form's own. Nothing here changes.</p>
        <app-single-file-dropzone
          #importDrop
          accept=".json,application/json"
          [maxBytes]="2 * 1024 * 1024"
          emptyTitle="Form file"
          emptyHint="Drop a form file (.json) or click to browse"
          selectedTitle="Form file"
          emptyIcon="pi-file-import"
          (fileChange)="readImport($event)"
          (invalidFile)="importError = $event"
        />
        @if (importError) {
          <small class="text-red-600">{{ importError }}</small>
        } @else if (importDef) {
          <small>{{ importDef.name }}: {{ importFieldCount() }} fields in {{ importDef.sections.length }} sections</small>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="importing()" (onClick)="importVisible = false" />
          <p-button label="Import" icon="pi pi-file-import" [loading]="importing()" [disabled]="!importDef" (onClick)="runImport()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
})
export class CareFormEditPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(MessageService);
  private readonly ws = inject(FormWorkspaceService);

  readonly levelOptions = [
    { value: 'none', label: 'None' },
    { value: 'read', label: 'Read' },
    { value: 'edit', label: 'Edit' },
  ];

  form = signal<CareFormDto | null>(null);
  roles = signal<{ id: string; name: string }[]>([]);
  levels = signal<FormAccess>({});
  error = signal<string | null>(null);
  saving = signal(false);
  name = '';
  description = '';
  private saved = '';

  importVisible = false;
  importDef: FormDefinition | null = null;
  importError = '';
  importing = signal(false);
  private readonly importDrop = viewChild<SingleFileDropzoneComponent>('importDrop');

  /** ⋮ menu: move this form's setup to another UBO (e.g. local to production) as a form file. */
  readonly headerActions: RowActionItem[] = [
    { id: 'export', label: 'Export form file', icon: 'pi pi-download', command: () => void this.exportFile() },
    { id: 'import', label: 'Import form file', icon: 'pi pi-file-import', command: () => this.openImport() },
  ];

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';
  /** The builder profile of this form (what it can have). */
  profile = computed(() => formProfile(CARE_FORM_MODULE, this.form()?.kind ?? 'INTAKE'));

  private readonly query = toSignal(this.route.queryParamMap);
  /** What the main area shows (the column picks it): settings, access, links, or a section id. Default: the first section. */
  readonly view = computed(() => {
    const f = this.form();
    const v = this.query()?.get('view');
    if (v === 'settings') return v;
    if (v === 'access' && f?.kind !== 'VISIT') return v;
    if (v === 'links' && this.profile().newLinks) return v;
    if (v && f?.sections.some((x) => x.id === v)) return v;
    return f?.sections[0]?.id ?? 'settings';
  });
  readonly currentSection = computed(() => this.form()?.sections.find((x) => x.id === this.view()) ?? null);

  constructor() {
    // The column added or reordered sections: show the fresh form.
    effect(() => {
      if (this.ws.changed()) void this.reload();
    });
  }

  /** This form in the workspace column: its sections, then Settings, Who can use it and (Intake) Links. */
  private workspace(form: CareFormDto | null): WorkspaceConfig {
    const kind = form?.kind ?? 'INTAKE';
    return {
      base: ['/care/forms', this.id],
      tools: [
        { id: 'settings', label: 'Settings', icon: 'pi-cog' },
        ...(kind !== 'VISIT' ? [{ id: 'access', label: 'Who can use it', icon: 'pi-users' }] : []),
        ...(formProfile(CARE_FORM_MODULE, kind).newLinks ? [{ id: 'links', label: 'Links', icon: 'pi-link' }] : []),
      ],
      emptyView: 'settings',
      load: async () => ({ ...(await this.care.form(this.id)), canEdit: true }),
      addSection: async (name) => (await this.care.addSection(this.id, name)).id,
      reorderSections: async (ids) => {
        await this.care.reorderSections(this.id, ids);
      },
    };
  }
  backLink = computed(() => CARE_KIND_ROUTE[this.form()?.kind ?? 'INTAKE']);
  backLabel = computed(() => CARE_KIND_LIST_TITLE[this.form()?.kind ?? 'INTAKE']);

  async ngOnInit() {
    this.ws.open(this.id, this.workspace(null));
    try {
      const [form, roles] = await Promise.all([this.care.form(this.id), this.care.roles()]);
      this.roles.set(roles);
      this.ws.config.set(this.workspace(form));
      this.apply(form);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load form');
    }
  }

  /** Builder changes save on their own; reload the fields without touching unsaved name/access edits. */
  async reload() {
    try {
      const form = await this.care.form(this.id);
      this.form.set(form);
      this.ws.form.set({ ...form, canEdit: true });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to reload form');
    }
  }

  private apply(form: CareFormDto) {
    this.form.set(form);
    this.ws.form.set({ ...form, canEdit: true });
    this.name = form.name;
    this.description = asHtml(form.description);
    this.levels.set({ ...form.access });
    this.saved = this.snapshot();
  }

  private snapshot() {
    return JSON.stringify({ n: this.name.trim(), d: blankHtml(this.description) ? '' : this.description.trim(), a: this.levels() });
  }

  isDirty() {
    return this.snapshot() !== this.saved;
  }

  setLevel(roleId: string, level: Level) {
    this.levels.update((l) => {
      const next = { ...l };
      if (level === 'none') delete next[roleId];
      else next[roleId] = level;
      return next;
    });
  }

  async exportFile() {
    try {
      downloadFormFile(await this.care.exportForm(this.id));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not export', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  openImport() {
    this.importDef = null;
    this.importError = '';
    this.importDrop()?.reset();
    this.importVisible = true;
  }

  async readImport(file: File | null) {
    this.importDef = null;
    this.importError = '';
    if (!file) return;
    try {
      this.importDef = await readFormFile(file);
    } catch (err) {
      this.importError = err instanceof Error ? err.message : 'That file could not be read.';
    }
  }

  importFieldCount() {
    return this.importDef?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0;
  }

  async runImport() {
    if (!this.importDef) return;
    this.importing.set(true);
    try {
      const res = await this.care.importForm(this.id, this.importDef);
      this.importVisible = false;
      await this.reload();
      this.toast.add({ severity: 'success', summary: 'Imported', detail: `Added ${res.fields} fields in ${res.sections} sections.` });
    } catch (err) {
      this.importError = err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Import failed';
    } finally {
      this.importing.set(false);
    }
  }

  async save() {
    if (!this.name.trim()) {
      this.error.set('Name is required');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.care.updateForm(this.id, { name: this.name.trim(), description: blankHtml(this.description) ? null : this.description.trim(), access: this.levels() });
      this.apply(await this.care.form(this.id));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: `${this.name.trim()} saved.` });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}

/** The description as editor HTML (older ones are plain text). */
function asHtml(text: string | null | undefined): string {
  if (!text?.trim()) return '';
  if (/^\s*</.test(text)) return text;
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}

/** An empty editor (no text, only blank paragraphs). */
function blankHtml(html: string | null | undefined): boolean {
  return !(html ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
