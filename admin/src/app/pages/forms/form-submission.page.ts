import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import {
  formatFormValue,
  formFieldPoints,
  questionFields,
  scoreBandResourceFileName,
  type FormFieldDto,
  type FormFileRef,
  type FormAttachInfoDto,
  type FormSubmissionDto,
} from '@upstart/back-office/shared';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormFilesClient } from '../../core/form-files.client';
import { FormsApi } from '../../core/forms.api';
import { AcceptResponseDialogComponent, type AcceptResponseChoice } from '../../ui/form-builder/accept-response-dialog.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { exportSubmissionExcel, exportSubmissionPdf } from './form-submission-export.util';
import { SUBMISSION_STATUS_TAG } from './forms.types';
import { SsnTextComponent } from '../../ui/ssn-input/ssn-text.component';

/** One submission of a free-standing form: answers as text, results (score, profile, areas), who sent it; Export, Accept, Dismiss. */
@Component({
  selector: 'app-form-submission-page',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule, MessageModule, ProgressBarModule, TabsModule, TagModule, AcceptResponseDialogComponent, PageComponent, RowActionsMenuComponent, SsnTextComponent],
  template: `
    <app-page [title]="pageTitle()" [backLink]="backLink()" [backQueryParams]="backQuery" [backLabel]="fromActivity ? 'Back to Activity' : 'Back to submissions'" helpKey="forms.submission.page">
      <ng-container ngProjectAs="[pageMeta]">
        @if (s(); as r) {
          @if (!r.submittedAt) {
            <p-tag value="In progress" severity="info" />
          } @else {
            <p-tag [value]="statusTag[r.status].label" [severity]="statusTag[r.status].severity" />
          }
          @if (r.clientId) {
            <a [routerLink]="['/organizations', r.clientId]" class="text-primary">Open {{ r.clientName }}</a>
          }
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (s(); as r) {
          @if (r.canEdit && !r.clientId) {
            <span class="split-action">
              <p-button label="Attach" icon="pi pi-check" (onClick)="openAccept()" />
              <app-row-actions-menu class="split-action-more" [attached]="true" [items]="headerActions()" ariaLabel="More submission actions" />
            </span>
          } @else {
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Submission actions" />
          }
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (s(); as r) {
        <div class="grid grid-3">
          <div class="stack span-2">
            @if (r.scores) {
              <p-tabs [value]="view()" (valueChange)="view.set($event === 'results' ? 'results' : 'answers')">
                <p-tablist>
                  <p-tab value="answers">Answers</p-tab>
                  <p-tab value="results">Results</p-tab>
                </p-tablist>
              </p-tabs>
            }
            @if (view() === 'results' && r.scores; as sc) {
              <div class="card">
                <div class="sr-head">
                  <div>
                    <div class="sr-kicker">Profile</div>
                    <h2 class="sr-band">{{ band()?.label ?? 'No profile' }}</h2>
                  </div>
                  <div class="sr-total">
                    <div class="sr-total-value">{{ round(sc.percent) }}%</div>
                    <div class="sr-kicker">Total score: {{ sc.total }} of {{ sc.max }} points</div>
                  </div>
                </div>
                @if (r.bands.length > 1) {
                  <div class="sr-scale" aria-label="Profiles, lowest to highest">
                    @for (b of r.bands; track b.id) {
                      <p-tag [value]="b.label" [severity]="b.id === band()?.id ? 'success' : 'secondary'" [class.sr-scale-off]="b.id !== band()?.id" />
                    }
                  </div>
                }
                @if (band(); as b) {
                  @if (b.description) {
                    <p class="sr-text">{{ b.description }}</p>
                  }
                  @if (b.nextSteps.length) {
                    <h3 class="card-title mt-3">Next steps</h3>
                    <ul class="sr-steps">
                      @for (step of b.nextSteps; track $index) {
                        <li>{{ step }}</li>
                      }
                    </ul>
                  }
                  @if (bandAssetHref(b); as href) {
                    <a [href]="href" target="_blank" rel="noopener" class="text-primary" [attr.download]="b.assetKind === 'file' ? scoreBandResourceFileName(b) : null"><i class="pi pi-file-pdf mr-1"></i>{{ b.assetLabel?.trim() || scoreBandResourceFileName(b) }}</a>
                  }
                }
              </div>
              @if (sc.groups.length) {
                <div class="card">
                  <div class="card-header"><h3 class="card-title">Score areas</h3></div>
                  <div class="sr-areas">
                    @for (g of sc.groups; track g.id) {
                      <div class="sr-area">
                        <span class="sr-area-name">{{ g.name }}</span>
                        <p-progressbar class="sr-bar" [value]="g.percent" [showValue]="false" />
                        <span class="sr-area-value">{{ round(g.percent) }}%</span>
                        <span class="sr-area-points">{{ g.score }} of {{ g.max }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            } @else {
              @for (sec of r.sections; track sec.id) {
                @let qs = questions(sec.fields);
                @if (qs.length) {
                  <div class="card">
                    <div class="card-header"><h3 class="card-title">{{ sec.name }}</h3></div>
                    <dl class="sa-list">
                      @for (f of qs; track f.id) {
                        @let text = answer(f, r.values[f.id]);
                        @let pts = points(f, r.values[f.id]);
                        <div class="sa-item">
                          <dt class="sa-q">{{ f.name }}</dt>
                          <dd class="sa-a" [class.sa-empty]="!text">
                            @if (f.type === 'FILE' && text) {
                              <span class="sa-text">
                                @for (file of fileRefs(r.values[f.id]); track file.key; let last = $last) {
                                  <button type="button" class="sa-file" (click)="openFile(file)">{{ file.name }}</button>@if (!last) {, }
                                }
                              </span>
                            } @else if (f.type === 'SSN' && text) {
                              <app-ssn-text [value]="$any(r.values[f.id])" />
                            } @else {
                              <span class="sa-text">{{ text || 'No answer' }}</span>
                            }
                            @if (pts !== null) {
                              <span class="sa-points">{{ pts }} {{ pts === 1 ? 'point' : 'points' }}</span>
                            }
                          </dd>
                        </div>
                      }
                    </dl>
                  </div>
                }
              }
            }
          </div>
          <div class="side-panel-stack span-1">
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
                      <span class="side-list-title">Total score</span>
                      <span class="side-list-detail">{{ sc.total }} of {{ sc.max }} points</span>
                    </div>
                    <span class="side-list-value side-list-value--strong">{{ round(sc.percent) }}%</span>
                  </div>
                  @if (r.bandLabel) {
                    <div class="side-list-row">
                      <div class="side-list-body">
                        <span class="side-list-title">Profile</span>
                        <span class="side-list-detail">{{ r.bandLabel }}</span>
                      </div>
                    </div>
                  }
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
        [(visible)]="acceptVisible"
        [defaultName]="s()?.isClientForm ? (s()?.submitterName ?? '') : (s()?.submitterOrganization ?? s()?.submitterName ?? '')"
        [isClientForm]="!!s()?.isClientForm"
        [formName]="s()?.formName ?? ''"
        [sender]="s()?.submitterName ?? s()?.submitterEmail ?? null"
        [info]="attachInfo()"
        [busy]="busy()"
        (accept)="accept($event)"
      />
    </app-page>
  `,
  styles: `
    .sa-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      margin: 0;
    }
    .sa-q {
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
      margin-bottom: 0.35rem;
    }
    .sa-a {
      margin: 0;
      display: flex;
      align-items: flex-start;
      gap: 0.75rem;
      padding: 0.55rem 0.75rem;
      border: 1px solid var(--surface-border);
      border-radius: var(--border-radius, 6px);
      background: var(--surface-50, var(--surface-ground));
      font-weight: 500;
    }
    .sa-text {
      flex: 1;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sa-file {
      background: none;
      border: 0;
      padding: 0;
      font: inherit;
      color: var(--primary-color);
      cursor: pointer;
    }
    .sa-file:hover {
      text-decoration: underline;
    }
    .sa-empty .sa-text {
      color: var(--text-color-secondary);
      font-weight: 400;
      font-style: italic;
    }
    .sa-points {
      flex-shrink: 0;
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
      font-weight: 400;
    }
    .sr-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .sr-kicker {
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
    }
    .sr-band {
      margin: 0.15rem 0 0;
    }
    .sr-total {
      text-align: right;
    }
    .sr-total-value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.1;
    }
    .sr-scale {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 1rem;
    }
    .sr-scale-off {
      opacity: 0.6;
    }
    .sr-text {
      margin: 1rem 0 0;
      line-height: 1.55;
    }
    .sr-steps {
      margin: 0.5rem 0 1rem;
      padding-left: 1.25rem;
      line-height: 1.55;
    }
    .sr-areas {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }
    .sr-area {
      display: grid;
      grid-template-columns: minmax(8rem, 14rem) 1fr 3rem 5rem;
      align-items: center;
      gap: 0.75rem;
    }
    .sr-area-value {
      font-weight: 600;
      text-align: right;
    }
    .sr-area-points {
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
    }
    .sr-bar {
      --p-progressbar-height: 0.6rem;
      --p-progressbar-value-background: var(--p-green-500);
    }
    @media (max-width: 640px) {
      .sr-area {
        grid-template-columns: 1fr 3rem;
      }
      .sr-bar {
        grid-column: 1 / -1;
        order: 3;
      }
      .sr-area-points {
        display: none;
      }
    }
  `,
})
export class FormSubmissionPage implements OnInit {
  private readonly forms = inject(FormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly formFiles = inject(FormFilesClient);

  /** An answer's uploaded files. */
  fileRefs(v: unknown): FormFileRef[] {
    return Array.isArray(v) ? (v as FormFileRef[]) : [];
  }

  /** Download one of this submission's files (signed in). */
  openFile(file: FormFileRef) {
    this.formFiles.opener(`${this.forms.base}/submissions/${this.id}/files`)(file);
  }

  readonly statusTag = SUBMISSION_STATUS_TAG;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  s = signal<FormSubmissionDto | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  acceptVisible = signal(false);
  attachInfo = signal<FormAttachInfoDto | null>(null);
  view = signal<'answers' | 'results'>('answers');

  band = computed(() => {
    const r = this.s();
    return r?.scores?.bandId ? r.bands.find((b) => b.id === r.scores!.bandId) ?? null : null;
  });

  bandAssetHref(b: { assetUrl: string | null }) {
    return resolveAssetUrl(b.assetUrl);
  }

  /** The section's questions (text blocks have no answers). */
  questions(fields: FormFieldDto[]) {
    return questionFields(fields);
  }

  answer(f: FormFieldDto, v: unknown) {
    return formatFormValue(f, v);
  }

  points(f: FormFieldDto, v: unknown) {
    return formFieldPoints(f, v);
  }

  exportPdf() {
    const r = this.s();
    if (r) void exportSubmissionPdf(r);
  }

  exportExcel() {
    const r = this.s();
    if (r) exportSubmissionExcel(r);
  }

  pageTitle = computed(() => {
    const r = this.s();
    return r ? `${r.formName}: ${r.submitterName ?? r.submitterEmail ?? 'Submission'}` : 'Submission';
  });
  /** Opened from Activity → Form submissions: the back arrow (and leaving after delete) returns there. */
  readonly fromActivity = this.route.snapshot.queryParamMap.get('from') === 'activity';
  readonly backQuery: Record<string, string> | null = this.fromActivity ? { tab: 'todo', queue: 'forms' } : null;
  backLink = computed(() =>
    this.fromActivity ? '/activity' : this.s() ? ['/forms', this.s()!.formId, 'submissions'] : '/forms',
  );

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

  /** ⋮ menu: Dismiss or Restore, the two exports, then Delete. Viewers get the exports only. */
  headerActions(): RowActionItem[] {
    const r = this.s();
    if (!r) return [];
    const items: RowActionItem[] = [];
    if (r.canEdit && r.status === 'PENDING') items.push({ id: 'dismiss', label: 'Dismiss', icon: 'pi pi-times', disabled: this.busy(), command: () => void this.dismiss() });
    if (r.canEdit && r.status === 'DISMISSED') items.push({ id: 'restore', label: 'Restore', icon: 'pi pi-undo', disabled: this.busy(), command: () => void this.restore() });
    items.push(
      { id: 'pdf', label: 'Export PDF', icon: 'pi pi-file-pdf', command: () => this.exportPdf() },
      { id: 'excel', label: 'Export Excel', icon: 'pi pi-file-excel', command: () => this.exportExcel() },
    );
    if (r.canEdit) items.push({ id: 'delete', label: 'Delete submission', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove() });
    return items;
  }

  /** Look up possible matches (same email or name), then open Accept. */
  async openAccept() {
    try {
      this.attachInfo.set(await this.forms.attachInfo(this.id));
    } catch {
      this.attachInfo.set(null);
    }
    this.acceptVisible.set(true);
  }

  async accept(choice: AcceptResponseChoice) {
    await this.run(async () => {
      const r = await this.forms.accept(this.id, choice);
      this.s.set(r);
      this.acceptVisible.set(false);
      this.toast.add({ severity: 'success', summary: 'Attached', detail: `Attached to ${r.clientName}.` });
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
          await (this.fromActivity
            ? this.router.navigate(['/activity'], { queryParams: this.backQuery })
            : this.router.navigate(['/forms', r.formId, 'submissions']));
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
