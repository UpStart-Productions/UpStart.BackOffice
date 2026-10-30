import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { CARE_FORM_MODULE, formProfile, type CareFormDto, type FormAccess, type FormDefinition } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
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

/** Customize fields (from Care → Intake or Care profiles, Setup only): name, who can use it, sections and fields, and (Intake) public links. */
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
    TextareaModule,
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
          <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
        </ng-container>
      }
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      @if (form(); as f) {
        <div class="stack">
          <div class="card">
            <div class="showcase-flex-col">
              <div class="form-field">
                <label for="cfName">Name</label>
                <input pInputText id="cfName" class="w-full" [(ngModel)]="name" />
              </div>
              <div class="form-field">
                <label for="cfDesc">Description <app-help-text key="care.form.description" /></label>
                <textarea pTextarea id="cfDesc" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="description"></textarea>
              </div>
            </div>
          </div>

          @if (f.kind !== 'VISIT') {
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

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Fields</h3>
            </div>
            <app-form-builder [form]="f" [profile]="profile()" apiBase="/care" (changed)="reload()" />
          </div>

          @if (profile().newLinks) {
            <div class="card">
              <app-form-links apiBase="/care" [formId]="f.id" title="Public intake links" helpKey="care.links.intake" />
            </div>
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
  backLink = computed(() => CARE_KIND_ROUTE[this.form()?.kind ?? 'INTAKE']);
  backLabel = computed(() => CARE_KIND_LIST_TITLE[this.form()?.kind ?? 'INTAKE']);

  async ngOnInit() {
    try {
      const [form, roles] = await Promise.all([this.care.form(this.id), this.care.roles()]);
      this.roles.set(roles);
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
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to reload form');
    }
  }

  private apply(form: CareFormDto) {
    this.form.set(form);
    this.name = form.name;
    this.description = form.description ?? '';
    this.levels.set({ ...form.access });
    this.saved = this.snapshot();
  }

  private snapshot() {
    return JSON.stringify({ n: this.name.trim(), d: this.description.trim(), a: this.levels() });
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
      await this.care.updateForm(this.id, { name: this.name.trim(), description: this.description.trim() || null, access: this.levels() });
      this.apply(await this.care.form(this.id));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: `${this.name.trim()} saved.` });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
