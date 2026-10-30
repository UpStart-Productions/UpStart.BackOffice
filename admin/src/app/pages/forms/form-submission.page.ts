import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import type { FormSubmissionDto } from '@upstart/back-office/shared';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormsApi } from '../../core/forms.api';
import { AcceptResponseDialogComponent, type AcceptResponseChoice } from '../../ui/form-builder/accept-response-dialog.component';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { SUBMISSION_STATUS_TAG } from './forms.types';

/** One submission of a free-standing form: answers (read only), scores, who sent it; Accept into an organization, Dismiss. */
@Component({
  selector: 'app-form-submission-page',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule, MessageModule, TagModule, AcceptResponseDialogComponent, FormFieldInputComponent, PageComponent, RowActionsMenuComponent],
  template: `
    <app-page [title]="pageTitle()" [backLink]="backLink()" [backLabel]="'Back to submissions'" helpKey="forms.submission.page">
      <ng-container ngProjectAs="[pageMeta]">
        @if (s(); as r) {
          <p-tag [value]="statusTag[r.status].label" [severity]="statusTag[r.status].severity" />
          @if (r.clientId) {
            <a [routerLink]="['/organizations', r.clientId]" class="text-primary">Open organization</a>
          }
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (s(); as r) {
          @if (r.canEdit) {
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Submission actions" />
            @if (r.status === 'PENDING') {
              <p-button label="Dismiss" icon="pi pi-times" severity="secondary" [outlined]="true" [loading]="busy()" (onClick)="dismiss()" />
            }
            @if (r.status === 'DISMISSED') {
              <p-button label="Restore" icon="pi pi-undo" severity="secondary" [outlined]="true" [loading]="busy()" (onClick)="restore()" />
            }
            @if (!r.clientId) {
              <p-button label="Accept" icon="pi pi-check" (onClick)="acceptVisible.set(true)" />
            }
          }
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (s(); as r) {
        <div class="grid grid-3">
          <div class="stack span-2">
            @for (sec of r.sections; track sec.id) {
              @if (sec.fields.length) {
                <div class="card">
                  <div class="card-header"><h3 class="card-title">{{ sec.name }}</h3></div>
                  <div class="showcase-row">
                    @for (f of sec.fields; track f.id) {
                      <app-form-field-input class="showcase-half" [class.fs-wide]="f.type === 'LONG_TEXT'" [field]="f" [value]="r.values[f.id] ?? null" [disabled]="true" />
                    }
                  </div>
                </div>
              }
            }
          </div>
          <div class="stack span-1">
            <div class="card card--side">
              <div class="card-header"><h3 class="card-title">Submitted by</h3></div>
              <div class="side-list">
                <div class="side-list-row">
                  <div class="side-list-body">
                    <span class="side-list-title">{{ r.submitterName }}</span>
                    @if (r.submitterOrganization) {
                      <span class="side-list-detail">{{ r.submitterOrganization }}</span>
                    }
                    <span class="side-list-detail">{{ r.submitterEmail }}</span>
                    @if (r.submitterPhone) {
                      <span class="side-list-detail">{{ r.submitterPhone }}</span>
                    }
                    <span class="side-list-detail">{{ r.createdAt | date: 'MMM d, y, h:mm a' }}@if (r.versionNumber) {, version {{ r.versionNumber }}}</span>
                  </div>
                </div>
              </div>
            </div>
            @if (r.scores; as sc) {
              <div class="card card--side">
                <div class="card-header"><h3 class="card-title">Score</h3></div>
                <div class="side-list">
                  <div class="side-list-row">
                    <div class="side-list-body">
                      <span class="side-list-title">{{ r.bandLabel ?? 'Overall' }}</span>
                      <span class="side-list-detail">{{ sc.total }} of {{ sc.max }} points</span>
                    </div>
                    <span class="side-list-value side-list-value--strong">{{ round(sc.percent) }}%</span>
                  </div>
                  @for (g of sc.groups; track g.id) {
                    <div class="side-list-row">
                      <div class="side-list-body">
                        <span class="side-list-title">{{ g.name }}</span>
                        <span class="side-list-detail">{{ g.score }} of {{ g.max }} points</span>
                      </div>
                      <span class="side-list-value">{{ round(g.percent) }}%</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }

      <app-accept-response-dialog
        header="Accept submission"
        [(visible)]="acceptVisible"
        [defaultName]="s()?.submitterOrganization ?? s()?.submitterName ?? ''"
        [busy]="busy()"
        (accept)="accept($event)"
      />
    </app-page>
  `,
  styles: `
    .fs-wide {
      flex-basis: 100%;
    }
  `,
})
export class FormSubmissionPage implements OnInit {
  private readonly forms = inject(FormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  readonly statusTag = SUBMISSION_STATUS_TAG;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  s = signal<FormSubmissionDto | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  acceptVisible = signal(false);

  pageTitle = computed(() => {
    const r = this.s();
    return r ? `${r.formName}: ${r.submitterName ?? r.submitterEmail ?? 'Submission'}` : 'Submission';
  });
  backLink = computed(() => (this.s() ? ['/forms', this.s()!.formId, 'submissions'] : '/forms'));

  round(n: number) {
    return Math.round(n);
  }

  async ngOnInit() {
    try {
      this.s.set(await this.forms.submission(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load');
    }
  }

  headerActions(): RowActionItem[] {
    return [{ id: 'delete', label: 'Delete submission', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove() }];
  }

  async accept(choice: AcceptResponseChoice) {
    await this.run(async () => {
      const r = await this.forms.accept(this.id, choice);
      this.s.set(r);
      this.acceptVisible.set(false);
      this.toast.add({ severity: 'success', summary: 'Accepted', detail: `Added to ${r.clientName}.` });
    }, 'Could not accept');
  }

  async dismiss() {
    await this.run(async () => this.s.set(await this.forms.dismiss(this.id)), 'Could not dismiss');
  }

  async restore() {
    await this.run(async () => this.s.set(await this.forms.restore(this.id)), 'Could not restore');
  }

  confirmRemove() {
    const r = this.s();
    if (!r) return;
    this.confirmDelete.confirm({
      message: `Delete this submission from ${r.submitterName ?? r.submitterEmail ?? 'someone'}? Their results link stops working. This cannot be undone.`,
      accept: async () => {
        try {
          await this.forms.deleteSubmission(r.id);
          await this.router.navigate(['/forms', r.formId, 'submissions']);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }

  private async run(fn: () => Promise<void>, failSummary: string) {
    this.busy.set(true);
    try {
      await fn();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: failSummary, detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.busy.set(false);
    }
  }
}
