import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import type { ClientFormResultDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ClientFormsApi } from '../../core/client-forms.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormFilesClient } from '../../core/form-files.client';
import { normalizeValues } from '../../core/form-values.util';
import { SessionService } from '../../core/session.service';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { FormLinksComponent } from '../../ui/form-builder/form-links.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/** One client's result of a client form: answers (Save), share link for living copies, move or delete. */
@Component({
  selector: 'app-client-form-result-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    MessageModule,
    AppDialogModule,
    FormFieldInputComponent,
    FormLinksComponent,
    PageComponent,
    OrganizationSelectComponent,
    RecordAttributionComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="pageTitle()" [backLink]="backLink()" backLabel="Back to client" helpKey="forms.result.page">
      <ng-container ngProjectAs="[pageTitleTrail]">
        @if (record()?.attribution) {
          <app-record-attribution [attribution]="record()!.attribution!" />
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (record(); as r) {
          @if (r.myAccess === 'edit') {
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Form actions" />
            <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
          }
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (record(); as r) {
        <div class="grid grid-3">
          <div class="stack span-2">
            @if (!hasFields()) {
              <div class="card">
                @if (canDesign()) {
                  <div class="flex align-items-center gap-3 flex-wrap">
                    <p class="m-0 flex-1">This form has no fields yet.</p>
                    <a pButton label="Open form" icon="pi pi-sliders-h" severity="secondary" [outlined]="true" [routerLink]="['/forms', r.formId]"></a>
                  </div>
                } @else {
                  <p class="m-0">This form has no fields yet. Ask someone who manages Forms to add them.</p>
                }
              </div>
            }
            @for (s of r.sections; track s.id) {
              @if (s.fields.length) {
                <div class="card">
                  <div class="card-header"><h3 class="card-title">{{ s.name }}</h3></div>
                  <div class="showcase-row">
                    @for (f of s.fields; track f.id) {
                      <app-form-field-input
                        class="showcase-half"
                        [class.cr-wide]="f.type === 'LONG_TEXT' || f.type === 'CONTENT' || f.type === 'GROUP'"
                        [field]="f"
                        [value]="values[f.id] ?? null"
                        (valueChange)="values[f.id] = $event"
                        [disabled]="r.myAccess !== 'edit'"
                        [fileUpload]="fileUpload()"
                        [fileOpen]="fileOpen()"
                      />
                    }
                  </div>
                </div>
              }
            }
          </div>
          <div class="stack span-1">
            <div class="card card--side">
              <div class="card-header"><h3 class="card-title">Details</h3></div>
              <div class="side-list">
                <div class="side-list-row">
                  <div class="side-list-body"><span class="side-list-title">Client</span></div>
                  <a class="side-list-value text-primary" [routerLink]="['/clients', r.clientId]">{{ r.clientName }}</a>
                </div>
                @if (r.category) {
                  <div class="side-list-row">
                    <div class="side-list-body"><span class="side-list-title">Category</span></div>
                    <span class="side-list-value">{{ r.category }}</span>
                  </div>
                }
                <div class="side-list-row">
                  <div class="side-list-body"><span class="side-list-title">Added</span></div>
                  <span class="side-list-value">{{ r.createdAt | date: 'MMM d, y' }}</span>
                </div>
              </div>
            </div>
            @if (r.submitterName) {
              <div class="card card--side">
                <div class="card-header"><h3 class="card-title">Submitted by</h3></div>
                <div class="side-list">
                  <div class="side-list-row">
                    <div class="side-list-body">
                      <span class="side-list-title">{{ r.submitterName }}</span>
                      <span class="side-list-detail">{{ r.submitterEmail }}</span>
                      @if (r.submitterPhone) {
                        <span class="side-list-detail">{{ r.submitterPhone }}</span>
                      }
                    </div>
                  </div>
                </div>
              </div>
            }
            @if (r.publicUpdatedAt) {
              <div class="card card--side">
                <div class="card-header"><h3 class="card-title">Last change through a link</h3></div>
                <p class="m-0">{{ r.publicUpdatedBy }}, {{ r.publicUpdatedAt | date: 'MMM d, y, h:mm a' }}</p>
              </div>
            }
            @if (r.canShare) {
              <div class="card card--side">
                <app-form-links [apiBase]="api.base" [recordId]="r.id" helpKey="forms.result.links" [compact]="true" />
              </div>
            }
          </div>
        </div>
      }

      <p-dialog header="Move to another client" [(visible)]="moveVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <p class="mt-0">Moves this {{ record()?.formName }} from {{ record()?.clientName }} to another client.</p>
        <div class="form-field">
          <label for="cfrMove">Client</label>
          <app-organization-select inputId="cfrMove" [(value)]="moveClientId" [exclude]="record()?.clientId ? [record()!.clientId!] : []" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="moving()" (onClick)="moveVisible = false" />
          <p-button label="Move" icon="pi pi-arrow-right" [loading]="moving()" [disabled]="!moveClientId" (onClick)="move()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `
    .cr-wide {
      flex-basis: 100%;
    }
  `,
})
export class ClientFormResultPage implements OnInit {
  readonly api = inject(ClientFormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);
  private readonly formFiles = inject(FormFilesClient);
  /** File questions: upload to this form, download through this result. */
  readonly fileUpload = computed(() => (this.record() ? this.formFiles.uploader(this.record()!.formId) : null));
  readonly fileOpen = computed(() => (this.record() ? this.formFiles.opener(`/client-forms/records/${this.record()!.id}/files`) : null));
  /** People who can edit forms in Forms get a link to the form when it has no fields. */
  readonly canDesign = computed(() => this.session.can('forms', 'edit'));

  record = signal<ClientFormResultDto | null>(null);
  error = signal<string | null>(null);
  saving = signal(false);
  values: Record<string, unknown> = {};
  private saved = '';

  moveVisible = false;
  moveClientId: string | null = null;
  moving = signal(false);

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly hasFields = computed(() => (this.record()?.sections ?? []).some((s) => s.fields.length));
  readonly backLink = computed(() => (this.record()?.clientId ? `/clients/${this.record()!.clientId}` : '/clients'));
  readonly pageTitle = computed(() => {
    const r = this.record();
    return r ? `${r.formName}: ${r.clientName ?? ''}` : 'Form';
  });

  async ngOnInit() {
    try {
      this.apply(await this.api.result(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  private apply(r: ClientFormResultDto) {
    this.record.set(r);
    this.values = { ...r.values };
    this.saved = JSON.stringify(normalizeValues(this.values));
  }

  isDirty() {
    return JSON.stringify(normalizeValues(this.values)) !== this.saved;
  }

  headerActions(): RowActionItem[] {
    return [
      { id: 'move', label: 'Move to another client', icon: 'pi pi-arrow-right-arrow-left', command: () => this.openMove() },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete() },
    ];
  }

  openMove() {
    this.moveClientId = null;
    this.moveVisible = true;
  }

  async move() {
    if (!this.moveClientId) return;
    this.moving.set(true);
    try {
      const r = await this.api.changeClient(this.id, this.moveClientId);
      this.apply(r);
      this.moveVisible = false;
      this.toast.add({ severity: 'success', summary: 'Moved', detail: `Now on ${r.clientName}.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not move', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.moving.set(false);
    }
  }

  async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      // Send every field: empty ones clear.
      const out: Record<string, unknown> = {};
      for (const s of this.record()?.sections ?? []) for (const f of s.fields) out[f.id] = this.values[f.id] ?? null;
      this.apply(await this.api.save(this.id, out));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Form saved.' });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete() {
    const r = this.record();
    if (!r) return;
    this.confirm.confirm({
      header: 'Confirm delete',
      message: `Delete ${r.formName} for ${r.clientName}? Everything filled in is removed. This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.remove(r.id);
          await this.router.navigate(['/clients', r.clientId]);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }
}
