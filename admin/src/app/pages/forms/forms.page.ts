import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { type FormDefinition, type FreeFormListItemDto } from '@upstart/back-office/shared';
import { readFormFile } from '../../core/form-file.util';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormsApi } from '../../core/forms.api';
import { SessionService } from '../../core/session.service';
import { SingleFileDropzoneComponent } from '../../ui/single-file-dropzone/single-file-dropzone.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';

/** Forms: free-standing forms (sign-ups, assessments, feedback) with public links and submissions. */
@Component({
  selector: 'app-forms-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    AppDialogModule,
    HelpTextComponent,
    PageComponent,
    RowActionsMenuComponent,
    SingleFileDropzoneComponent,
    ToolbarSearchFieldComponent,
  ],
  template: `
    <app-page title="Forms" helpKey="forms.page">
      <ng-container ngProjectAs="[pageActions]">
        @if (canCreate()) {
          <p-button label="New form" icon="pi pi-plus" (onClick)="openNew()" />
        }
      </ng-container>
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <div class="toolbar">
          <div class="toolbar-search">
            <app-toolbar-search-field placeholder="Search forms…" ariaLabel="Search forms" [(ngModel)]="query" />
          </div>
        </div>
        <p-table [value]="filtered()" [loading]="loading()" styleClass="table-bordered" [paginator]="filtered().length > 50" [rows]="50">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>Form</th>
              <th>Status</th>
              <th>Submissions</th>
              <th>Updated</th>
              <th>Created by</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-f>
            <tr>
              <td><app-row-actions-menu [items]="rowActions(f)" ariaLabel="Form actions" /></td>
              <td><a [routerLink]="['/forms', f.id]" class="text-primary">{{ f.name }}</a></td>
              <td>
                @if (f.publishedNumber === null) {
                  <p-tag value="Draft" severity="secondary" />
                } @else if (f.hasUnpublishedChanges) {
                  <p-tag value="Changes not published" severity="warn" />
                } @else {
                  <p-tag value="Published" severity="success" />
                }
              </td>
              <td>
                <a [routerLink]="['/forms', f.id, 'submissions']" class="text-primary">{{ f.responseCount }}</a>
                @if (f.pendingCount) {
                  <span class="count-badge ml-2" title="Waiting for review">{{ f.pendingCount }}</span>
                }
              </td>
              <td>{{ f.updatedAt | date: 'MMM d, y' }}</td>
              <td>{{ f.createdByName ?? '' }}</td>
            </tr>
          </ng-template>
          <ng-template pTemplate="emptymessage">
            <tr><td colspan="6">{{ loading() ? '' : 'No forms yet.' }}</td></tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog header="New form" [(visible)]="newVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <div class="form-field">
          <label for="nfName">Name</label>
          <input pInputText id="nfName" class="w-full" [(ngModel)]="newName" [placeholder]="importDef?.name ?? ''" (keydown.enter)="create()" />
        </div>
        <div class="form-field mt-3">
          <label>Start from a form file (optional) <app-help-text key="forms.import" /></label>
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
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="creating()" (onClick)="newVisible = false" />
          <p-button label="Create" icon="pi pi-check" [loading]="creating()" [disabled]="!canSubmitNew()" (onClick)="create()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
})
export class FormsPage implements OnInit {
  private readonly forms = inject(FormsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly session = inject(SessionService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  items = signal<FreeFormListItemDto[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  creating = signal(false);
  query = '';
  newVisible = false;
  newName = '';
  /** A form file picked in New form (creates the form from it). */
  importDef: FormDefinition | null = null;
  importError = '';
  private readonly importDrop = viewChild<SingleFileDropzoneComponent>('importDrop');

  readonly canCreate = computed(() => this.session.can('forms', 'create'));
  readonly canDelete = computed(() => this.session.can('forms', 'delete'));

  filtered() {
    const q = this.query.trim().toLowerCase();
    return q ? this.items().filter((f) => f.name.toLowerCase().includes(q)) : this.items();
  }

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.items.set(await this.forms.list());
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      this.loading.set(false);
    }
  }

  rowActions(f: FreeFormListItemDto): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'open', label: 'Open', icon: 'pi pi-pencil', command: () => void this.router.navigate(['/forms', f.id]) },
      { id: 'submissions', label: 'Submissions', icon: 'pi pi-inbox', command: () => void this.router.navigate(['/forms', f.id, 'submissions']) },
    ];
    if (this.canDelete()) {
      items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove(f) });
    }
    return items;
  }

  openNew() {
    this.newName = '';
    this.importDef = null;
    this.importError = '';
    this.importDrop()?.reset();
    this.newVisible = true;
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

  canSubmitNew() {
    return !this.importError && (!!this.importDef || !!this.newName.trim());
  }

  async create() {
    if (!this.canSubmitNew()) return;
    const name = this.newName.trim();
    this.creating.set(true);
    try {
      const { id } = this.importDef ? await this.forms.import(this.importDef, name || undefined) : await this.forms.create({ name });
      this.newVisible = false;
      await this.router.navigate(['/forms', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not create form', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.creating.set(false);
    }
  }

  confirmRemove(f: FreeFormListItemDto) {
    const n = f.responseCount;
    this.confirmDelete.confirm({
      message: n
        ? `Delete "${f.name}"? Its links stop working and its ${n} ${n === 1 ? 'submission is' : 'submissions are'} deleted. This cannot be undone.`
        : `Delete "${f.name}"? Its links stop working. This cannot be undone.`,
      accept: async () => {
        try {
          await this.forms.remove(f.id);
          await this.load();
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }
}
