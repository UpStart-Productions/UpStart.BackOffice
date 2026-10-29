import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import type { CareRecordDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CareApi } from '../../core/care.api';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { CareLinksComponent } from '../../ui/care-forms/care-links.component';
import { CARE_KIND_LIST_TITLE, CARE_KIND_ROUTE, normalizeValues } from '../../ui/care-forms/care.types';
import { FormFieldInputComponent } from '../../ui/care-forms/form-field-input.component';
import { PageComponent } from '../../ui/layout/page.component';
import { OrganizationSelectComponent } from '../../ui/organization-select/organization-select.component';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/** One organization's copy of a Care form (or a public intake waiting for review). */
@Component({
  selector: 'app-care-record-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
    TagModule,
    AppDialogModule,
    CareLinksComponent,
    FormFieldInputComponent,
    OrganizationSelectComponent,
    PageComponent,
    RecordAttributionComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="pageTitle()" [backLink]="backLink()" [backLabel]="'Back to ' + backLabel()" helpKey="care.record.page">
      <ng-container ngProjectAs="[pageTitleTrail]">
        @if (record()?.attribution) {
          <app-record-attribution [attribution]="record()!.attribution!" />
        }
      </ng-container>
      <ng-container ngProjectAs="[pageMeta]">
        @if (record(); as r) {
          @if (r.status === 'PENDING') {
            <p-tag value="Waiting for review" severity="warn" />
          }
          @if (r.clientId) {
            <a [routerLink]="['/organizations', r.clientId]" class="text-primary">Open organization</a>
          }
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (record(); as r) {
          @if (r.myAccess === 'edit') {
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Form actions" />
            @if (r.status === 'PENDING') {
              <p-button label="Accept" icon="pi pi-check" severity="secondary" [outlined]="true" (onClick)="openAccept()" />
            }
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
            @if (!r.sections.length) {
              <div class="card"><p class="m-0">This form has no fields yet. Add them under Care → Forms.</p></div>
            }
            @for (s of r.sections; track s.id) {
              @if (s.fields.length) {
                <div class="card">
                  <div class="card-header"><h3 class="card-title">{{ s.name }}</h3></div>
                  <div class="showcase-row">
                    @for (f of s.fields; track f.id) {
                      <app-form-field-input
                        class="showcase-half"
                        [class.cr-wide]="f.type === 'LONG_TEXT'"
                        [field]="f"
                        [value]="values[f.id] ?? null"
                        (valueChange)="values[f.id] = $event"
                        [disabled]="r.myAccess !== 'edit'"
                      />
                    }
                  </div>
                </div>
              }
            }
          </div>
          <div class="stack span-1">
            @if (r.status === 'PENDING' || r.submitterName) {
              <div class="card card--side">
                <div class="card-header"><h3 class="card-title">Submitted by</h3></div>
                <div class="side-list">
                  <div class="side-list-row"><div class="side-list-body"><span class="side-list-title">{{ r.submitterName }}</span><span class="side-list-detail">{{ r.submitterEmail }}</span>@if (r.submitterPhone) {<span class="side-list-detail">{{ r.submitterPhone }}</span>}</div></div>
                </div>
              </div>
            }
            @if (r.publicUpdatedAt) {
              <div class="card card--side">
                <div class="card-header"><h3 class="card-title">Last change through a link</h3></div>
                <p class="m-0">{{ r.publicUpdatedBy }}, {{ r.publicUpdatedAt | date: 'MMM d, y, h:mm a' }}</p>
              </div>
            }
            @if (r.clientId && r.myAccess === 'edit') {
              <div class="card card--side">
                <app-care-links [recordId]="r.id" />
              </div>
            }
          </div>
        </div>
      }

      <p-dialog header="Accept intake" [(visible)]="acceptVisible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
        <div class="form-field">
          <p-selectbutton [options]="acceptModes" optionLabel="label" optionValue="value" [(ngModel)]="acceptMode" [allowEmpty]="false" />
        </div>
        @if (acceptMode === 'new') {
          <div class="form-field mt-3">
            <label for="crAcceptName">Organization name</label>
            <input pInputText id="crAcceptName" class="w-full" [(ngModel)]="acceptName" />
          </div>
        } @else {
          <div class="form-field mt-3">
            <label for="crAcceptOrg">Organization</label>
            <app-organization-select inputId="crAcceptOrg" [(value)]="acceptClientId" />
          </div>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="accepting()" (onClick)="acceptVisible = false" />
          <p-button
            label="Accept"
            icon="pi pi-check"
            [loading]="accepting()"
            [disabled]="acceptMode === 'new' ? !acceptName.trim() : !acceptClientId"
            (onClick)="accept()"
          />
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
export class CareRecordPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmDeleteService);

  readonly acceptModes = [
    { value: 'new', label: 'New organization' },
    { value: 'existing', label: 'Existing organization' },
  ];

  record = signal<CareRecordDto | null>(null);
  error = signal<string | null>(null);
  saving = signal(false);
  accepting = signal(false);
  values: Record<string, unknown> = {};
  private saved = '';

  acceptVisible = false;
  acceptMode: 'new' | 'existing' = 'new';
  acceptName = '';
  acceptClientId: string | null = null;

  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  backLink = computed(() => CARE_KIND_ROUTE[this.record()?.kind ?? 'INTAKE']);
  backLabel = computed(() => CARE_KIND_LIST_TITLE[this.record()?.kind ?? 'INTAKE']);
  pageTitle = computed(() => {
    const r = this.record();
    if (!r) return 'Form';
    return `${r.formName}: ${r.clientName ?? r.submitterName ?? 'Untitled'}`;
  });

  async ngOnInit() {
    try {
      this.apply(await this.care.record(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  private apply(r: CareRecordDto) {
    this.record.set(r);
    this.values = { ...r.values };
    this.saved = JSON.stringify(normalizeValues(this.values));
  }

  isDirty() {
    return JSON.stringify(normalizeValues(this.values)) !== this.saved;
  }

  headerActions(): RowActionItem[] {
    const pending = this.record()?.status === 'PENDING';
    return [
      {
        id: 'delete',
        label: pending ? 'Dismiss' : 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(),
      },
    ];
  }

  async save() {
    this.saving.set(true);
    this.error.set(null);
    try {
      // Send every field: empty ones clear.
      const out: Record<string, unknown> = {};
      for (const s of this.record()?.sections ?? []) for (const f of s.fields) out[f.id] = this.values[f.id] ?? null;
      this.apply(await this.care.saveRecord(this.id, out));
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
    const pending = r.status === 'PENDING';
    this.confirm.confirm({
      header: pending ? 'Dismiss intake' : 'Confirm delete',
      message: pending
        ? `Dismiss this intake from ${r.submitterName ?? 'this person'}? It is deleted and cannot be brought back.`
        : `Delete ${r.formName} for ${r.clientName}? Everything filled in is removed. This cannot be undone.`,
      accept: async () => {
        try {
          await this.care.deleteRecord(r.id);
          if (r.kind === 'INTAKE') void this.care.refreshPendingCount();
          await this.router.navigate([CARE_KIND_ROUTE[r.kind]]);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }

  openAccept() {
    this.acceptMode = 'new';
    this.acceptName = this.record()?.submitterName ?? '';
    this.acceptClientId = null;
    this.acceptVisible = true;
  }

  async accept() {
    this.accepting.set(true);
    try {
      // Keep any unsaved edits.
      if (this.isDirty()) await this.save();
      const r = await this.care.accept(this.id, {
        mode: this.acceptMode,
        ...(this.acceptMode === 'new' ? { name: this.acceptName.trim() } : { clientId: this.acceptClientId ?? undefined }),
      });
      this.acceptVisible = false;
      this.apply(r);
      void this.care.refreshPendingCount();
      this.toast.add({ severity: 'success', summary: 'Accepted', detail: `Intake added to ${r.clientName}.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not accept', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.accepting.set(false);
    }
  }
}
