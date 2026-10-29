import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import type { CareFormAccess, CareFormDto } from '@upstart/back-office/shared';
import { CareApi } from '../../core/care.api';
import { CareLinksComponent } from '../../ui/care-forms/care-links.component';
import { FormBuilderComponent } from '../../ui/care-forms/form-builder.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';

type Level = 'none' | 'read' | 'edit';

/** One Care form: name and description, who can use it, its sections and fields, and (Intake) public links. */
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
    CareLinksComponent,
    FormBuilderComponent,
    HelpTextComponent,
    PageComponent,
  ],
  template: `
    <app-page [title]="form()?.name ?? 'Form'" backLink="/care/forms" backLabel="Back to Forms" helpKey="care.form.page">
      @if (form()) {
        <p-button pageActions label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
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

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Fields</h3>
            </div>
            <app-form-builder [form]="f" (changed)="reload()" />
          </div>

          @if (f.kind === 'INTAKE') {
            <div class="card">
              <app-care-links [formId]="f.id" />
            </div>
          }
        </div>
      }
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
  levels = signal<CareFormAccess>({});
  error = signal<string | null>(null);
  saving = signal(false);
  name = '';
  description = '';
  private saved = '';

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

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
