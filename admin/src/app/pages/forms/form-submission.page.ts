import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { formatFormValue, formFieldPoints, type FormFieldDto, type FormSubmissionDto } from '@upstart/back-office/shared';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormsApi } from '../../core/forms.api';
import { AcceptResponseDialogComponent, type AcceptResponseChoice } from '../../ui/form-builder/accept-response-dialog.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { exportSubmissionExcel, exportSubmissionPdf } from './form-submission-export.util';
import { SUBMISSION_STATUS_TAG } from './forms.types';

/** One submission of a free-standing form: answers as text, results (score, profile, areas), who sent it; Export, Accept, Dismiss. */
@Component({
  selector: 'app-form-submission-page',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule, MessageModule, ProgressBarModule, TabsModule, TagModule, AcceptResponseDialogComponent, PageComponent, RowActionsMenuComponent],
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
          <app-row-actions-menu [items]="headerActions()" ariaLabel="Submission actions" />
          @if (r.canEdit) {
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
                  @if (b.assetUrl) {
                    <a [href]="b.assetUrl" target="_blank" rel="noopener" class="text-primary"><i class="pi pi-file-pdf mr-1"></i>{{ b.assetLabel || 'Download' }}</a>
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
                @if (sec.fields.length) {
                  <div class="card">
                    <div class="card-header"><h3 class="card-title">{{ sec.name }}</h3></div>
                    <dl class="sa-list">
                      @for (f of sec.fields; track f.id) {
                        @let text = answer(f, r.values[f.id]);
                        @let pts = points(f, r.values[f.id]);
                        <div class="sa-item">
                          <dt class="sa-q">{{ f.name }}</dt>
                          <dd class="sa-a" [class.sa-empty]="!text">
                            <span class="sa-text">{{ text || 'No answer' }}</span>
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
        header="Accept submission"
        [(visible)]="acceptVisible"
        [defaultName]="s()?.submitterOrganization ?? s()?.submitterName ?? ''"
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

  readonly statusTag = SUBMISSION_STATUS_TAG;
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  s = signal<FormSubmissionDto | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  acceptVisible = signal(false);
  view = signal<'answers' | 'results'>('answers');

  band = computed(() => {
    const r = this.s();
    return r?.scores?.bandId ? r.bands.find((b) => b.id === r.scores!.bandId) ?? null : null;
  });

  answer(f: FormFieldDto, v: unknown) {
    return formatFormValue(f, v);
  }

  points(f: FormFieldDto, v: unknown) {
    return formFieldPoints(f, v);
  }

  exportPdf() {
    const r = this.s();
    if (r) exportSubmissionPdf(r);
  }

  exportExcel() {
    const r = this.s();
    if (r) exportSubmissionExcel(r);
  }

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
