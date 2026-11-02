import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import type { ClientFormResultDto, FormAttachInfoDto } from '@upstart/back-office/shared';
import { AutoSaver } from '../../core/auto-saver';
import { AcceptResponseDialogComponent, type AcceptResponseChoice } from '../../ui/form-builder/accept-response-dialog.component';
import { SaveStatusComponent } from '../../ui/save-status/save-status.component';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ClientFormsApi } from '../../core/client-forms.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormFilesClient } from '../../core/form-files.client';
import { SessionService } from '../../core/session.service';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { FormLinksComponent } from '../../ui/form-builder/form-links.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/**
 * One record's result of a client form: answers auto-save as they change (several people can work on it), Submit when
 * it's complete (Reopen to go back to In progress), share link for someone outside to fill it in, move or delete.
 */
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
    AcceptResponseDialogComponent,
    SaveStatusComponent,
    TagModule,
    RecordAttributionComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="pageTitle()" [backLink]="backLink()" backLabel="Back" helpKey="forms.result.page">
      <ng-container ngProjectAs="[pageTitleTrail]">
        @if (record()?.attribution) {
          <app-record-attribution [attribution]="record()!.attribution!" />
        }
      </ng-container>
      <ng-container ngProjectAs="[pageMeta]">
        @if (record(); as r) {
          @if (r.submittedAt) {
            <p-tag value="Submitted" severity="success" />
          } @else {
            <p-tag value="In progress" severity="info" />
          }
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (record(); as r) {
          @if (r.myAccess === 'edit') {
            <app-save-status [state]="saver.state()" />
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Form actions" />
            @if (r.submittedAt) {
              <p-button label="Reopen" icon="pi pi-undo" severity="secondary" [outlined]="true" [loading]="submitting()" (onClick)="reopen()" />
            } @else {
              <p-button label="Submit" icon="pi pi-check" [loading]="submitting()" (onClick)="submit()" />
            }
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
                        (valueChange)="onChange(f, $event)"
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

      <app-accept-response-dialog
        [(visible)]="moveVisible"
        [move]="true"
        [formName]="record()?.formName ?? ''"
        [isClientForm]="true"
        [excludeId]="record()?.clientId ?? null"
        [info]="moveInfo()"
        [busy]="moving()"
        (accept)="move($event)"
      />
    </app-page>
  `,
  styles: `
    .cr-wide {
      flex-basis: 100%;
    }
  `,
})
export class ClientFormResultPage implements OnInit, OnDestroy {
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
  submitting = signal(false);
  values: Record<string, unknown> = {};

  moveVisible = signal(false);
  moveInfo = signal<FormAttachInfoDto | null>(null);
  moving = signal(false);

  /** Auto-save: only the answers that changed go up, so people working on different parts don't overwrite each other. */
  readonly saver = new AutoSaver<unknown>(async (changes) => {
    const r = await this.api.save(this.id, changes);
    // Keep what's on screen (newer typing); take the server's bookkeeping (who changed it, when).
    this.record.set({ ...r, values: this.record()?.values ?? r.values });
  });

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
  }

  ngOnDestroy() {
    void this.saver.flush().catch(() => undefined);
    this.saver.destroy();
  }

  /** An answer changed: save it (picks, checkboxes and files right away; typing a moment after it stops). */
  onChange(f: { id: string; type: string }, value: unknown) {
    this.values[f.id] = value;
    const typing = f.type === 'TEXT' || f.type === 'LONG_TEXT' || f.type === 'NUMBER' || f.type === 'GROUP';
    this.saver.change(f.id, value ?? null, !typing);
  }

  headerActions(): RowActionItem[] {
    return [
      { id: 'move', label: 'Move to another client or organization', icon: 'pi pi-arrow-right-arrow-left', command: () => void this.openMove() },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete() },
    ];
  }

  async openMove() {
    try {
      this.moveInfo.set(await this.api.moveInfo(this.id));
    } catch {
      this.moveInfo.set(null);
    }
    this.moveVisible.set(true);
  }

  async move(choice: AcceptResponseChoice) {
    if (!choice.clientId) return;
    this.moving.set(true);
    try {
      await this.saver.flush();
      const r = await this.api.changeClient(this.id, choice.clientId);
      this.apply(r);
      this.moveVisible.set(false);
      this.toast.add({ severity: 'success', summary: 'Moved', detail: `Now on ${r.clientName}.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not move', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.moving.set(false);
    }
  }

  /** Submit: everything saved first, then required questions are checked. */
  async submit() {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.saver.flush();
      this.apply(await this.api.submit(this.id));
      this.toast.add({ severity: 'success', summary: 'Submitted', detail: `${this.record()?.formName} is submitted.` });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Could not submit');
    } finally {
      this.submitting.set(false);
    }
  }

  async reopen() {
    this.submitting.set(true);
    try {
      await this.saver.flush();
      this.apply(await this.api.reopen(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Could not reopen');
    } finally {
      this.submitting.set(false);
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
