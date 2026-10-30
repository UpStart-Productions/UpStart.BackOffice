import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import {
  FREE_FORM_MODULE, formProfile, type FormScoreBand, type FormScoreGroup, type FormScoring, type FormSettings, type FreeFormDto,
} from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { FormsApi } from '../../core/forms.api';
import { FormBuilderComponent } from '../../ui/form-builder/form-builder.component';
import { FormLinksComponent } from '../../ui/form-builder/form-links.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

const newId = () => Math.random().toString(36).slice(2, 10);

/**
 * One free-standing form: details and settings (Save), scoring and fields (save right away), Publish, public links.
 * Public links serve the published version, so changes reach respondents when the form is published again.
 */
@Component({
  selector: 'app-form-edit-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    TextareaModule,
    AppDialogModule,
    FormBuilderComponent,
    FormLinksComponent,
    HelpTextComponent,
    PageComponent,
    RowActionsMenuComponent,
  ],
  template: `
    <app-page [title]="form()?.name ?? 'Form'" backLink="/forms" backLabel="Back to Forms" helpKey="forms.form.page">
      <ng-container ngProjectAs="[pageMeta]">
        @if (form(); as f) {
          @if (!f.published) {
            <p-tag value="Draft" severity="secondary" />
          } @else if (f.hasUnpublishedChanges) {
            <p-tag value="Changes not published" severity="warn" />
          } @else {
            <p-tag value="Published" severity="success" />
          }
          <a [routerLink]="['/forms', f.id, 'submissions']" class="text-primary">Submissions</a>
        }
      </ng-container>
      <ng-container ngProjectAs="[pageActions]">
        @if (form(); as f) {
          <app-row-actions-menu [items]="headerActions()" ariaLabel="Form actions" />
          @if (f.canEdit) {
            <p-button
              label="Publish"
              icon="pi pi-send"
              severity="secondary"
              [outlined]="true"
              [loading]="publishing()"
              [disabled]="!f.hasUnpublishedChanges || isDirty()"
              (onClick)="publish()"
            />
            <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
          }
        }
      </ng-container>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (form(); as f) {
        <div class="stack">
          <div class="card">
            @if (!f.published) {
              <p-message severity="info" text="Not published yet. Links work once you publish." />
            } @else if (f.hasUnpublishedChanges) {
              <p-message severity="warn" [text]="'Version ' + f.published.number + ' is live. Your changes reach people when you publish again.'" />
            } @else {
              <p-message severity="success" [text]="'Version ' + f.published.number + ' is live (published ' + (f.published.publishedAt | date: 'MMM d, y') + ').'" />
            }
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Details</h3></div>
            <div class="showcase-flex-col">
              <div class="form-field">
                <label for="ffName">Name</label>
                <input pInputText id="ffName" class="w-full" [(ngModel)]="name" [disabled]="!f.canEdit" />
              </div>
              <div class="form-field">
                <label for="ffDesc">Description <app-help-text key="forms.form.description" /></label>
                <textarea pTextarea id="ffDesc" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="description" [disabled]="!f.canEdit"></textarea>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Settings</h3></div>
            <div class="showcase-flex-col">
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffReview" [binary]="true" [(ngModel)]="settings.review" [disabled]="!f.canEdit" />
                <label for="ffReview">Review submissions before they become prospects <app-help-text key="forms.form.review" /></label>
              </div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffOrg" [binary]="true" [(ngModel)]="settings.askOrganization" [disabled]="!f.canEdit" />
                <label for="ffOrg">Ask for their organization</label>
              </div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffPhone" [binary]="true" [(ngModel)]="settings.askPhone" [disabled]="!f.canEdit" />
                <label for="ffPhone">Ask for a phone number</label>
              </div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffEmail" [binary]="true" [(ngModel)]="settings.resultsEmail" [disabled]="!f.canEdit" />
                <label for="ffEmail">Email people their results <app-help-text key="forms.form.resultsEmail" /></label>
              </div>
              <div class="form-field">
                <label for="ffThanks">Thank-you message</label>
                <textarea pTextarea id="ffThanks" class="w-full" rows="2" [autoResize]="true" [(ngModel)]="thankYou" [disabled]="!f.canEdit" placeholder="Thanks! Your answers were sent."></textarea>
              </div>
              <div class="showcase-row">
                <div class="form-field showcase-half">
                  <label for="ffCtaLabel">Call to action <app-help-text key="forms.form.cta" /></label>
                  <input pInputText id="ffCtaLabel" class="w-full" [(ngModel)]="ctaLabel" [disabled]="!f.canEdit" placeholder="e.g. Schedule a discovery chat" />
                </div>
                <div class="form-field showcase-half">
                  <label for="ffCtaUrl">Call to action link</label>
                  <input pInputText id="ffCtaUrl" class="w-full" [(ngModel)]="ctaUrl" [disabled]="!f.canEdit" placeholder="https://" />
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Scoring <app-help-text key="forms.form.scoring" /></h3>
            </div>
            <div class="flex align-items-center gap-2">
              <p-checkbox inputId="ffScored" [binary]="true" [ngModel]="scoring().enabled" (ngModelChange)="setScoringEnabled($event)" [disabled]="!f.canEdit" />
              <label for="ffScored">Score this form</label>
            </div>
            @if (scoring().enabled) {
              <h4 class="mt-4 mb-2">Score areas <app-help-text key="forms.form.scoreAreas" /></h4>
              @if (f.canEdit) {
                <div class="field-action-row">
                  <input pInputText [(ngModel)]="newGroupName" placeholder="New score area, e.g. Data" class="flex-1" aria-label="New score area" (keydown.enter)="addGroup()" />
                  <p-button label="Add" icon="pi pi-plus" size="small" [disabled]="!newGroupName.trim()" (onClick)="addGroup()" />
                </div>
              }
              <p-table [value]="scoring().groups" styleClass="table-bordered mt-2">
                <ng-template pTemplate="header">
                  <tr><th style="width: 3rem"></th><th>Score area</th><th>Questions</th></tr>
                </ng-template>
                <ng-template pTemplate="body" let-g>
                  <tr>
                    <td>
                      @if (f.canEdit) {
                        <app-row-actions-menu [items]="groupActions(g)" ariaLabel="Score area actions" />
                      }
                    </td>
                    <td>{{ g.name }}</td>
                    <td>{{ groupFieldCount(g.id) }}</td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="3">No score areas. The form still gets one overall score.</td></tr>
                </ng-template>
              </p-table>

              <div class="flex align-items-center gap-2 mt-4 mb-2">
                <h4 class="m-0">Profiles <app-help-text key="forms.form.bands" /></h4>
                <span class="flex-1"></span>
                @if (f.canEdit) {
                  <p-button label="Add profile" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" (onClick)="openBand(null)" />
                }
              </div>
              <p-table [value]="scoring().bands" styleClass="table-bordered">
                <ng-template pTemplate="header">
                  <tr><th style="width: 3rem"></th><th>Profile</th><th>Score range</th><th>Next steps</th><th>Download</th></tr>
                </ng-template>
                <ng-template pTemplate="body" let-b let-i="rowIndex">
                  <tr>
                    <td>
                      @if (f.canEdit) {
                        <app-row-actions-menu [items]="bandActions(b)" ariaLabel="Profile actions" />
                      }
                    </td>
                    <td>{{ b.label }}</td>
                    <td>{{ bandRange(i) }}</td>
                    <td>{{ b.nextSteps.length }}</td>
                    <td>{{ b.assetUrl ? (b.assetLabel || 'Yes') : '' }}</td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="5">No profiles yet. People see their percentage only.</td></tr>
                </ng-template>
              </p-table>
            }
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Fields</h3></div>
            @if (f.canEdit) {
              <app-form-builder [form]="f" [profile]="profile" [apiBase]="forms.base" [scoreGroups]="scoring().enabled ? scoring().groups : []" (changed)="reload()" />
            } @else {
              <p class="m-0">Your role can view this form but not change it.</p>
            }
          </div>

          <div class="card">
            <app-form-links [apiBase]="forms.base" [formId]="f.id" title="Public links" helpKey="forms.form.links" />
          </div>
        </div>
      }

      <p-dialog [header]="editingBand ? 'Edit profile' : 'Add profile'" [(visible)]="bandVisible" [modal]="true" [style]="{ width: 'min(36rem, 96vw)' }">
        <div class="form-field">
          <label for="bdLabel">Name</label>
          <input pInputText id="bdLabel" class="w-full" [(ngModel)]="band.label" placeholder="e.g. Building Stability" />
        </div>
        <div class="form-field mt-3">
          <label for="bdUpTo">Scores up to (%) <app-help-text key="forms.form.bandUpTo" /></label>
          <p-inputNumber inputId="bdUpTo" [(ngModel)]="band.upTo" [min]="0" [max]="100" [useGrouping]="false" styleClass="w-full" inputStyleClass="w-full" />
        </div>
        <div class="form-field mt-3">
          <label for="bdDesc">What this means</label>
          <textarea pTextarea id="bdDesc" class="w-full" rows="4" [autoResize]="true" [(ngModel)]="band.description"></textarea>
        </div>
        <div class="form-field mt-3">
          <label for="bdSteps">Recommended next steps (one per line)</label>
          <textarea pTextarea id="bdSteps" class="w-full" rows="4" [autoResize]="true" [(ngModel)]="bandSteps"></textarea>
        </div>
        <div class="showcase-row mt-3">
          <div class="form-field showcase-half">
            <label for="bdAsset">Download link</label>
            <input pInputText id="bdAsset" class="w-full" [(ngModel)]="band.assetUrl" placeholder="https://…/guide.pdf" />
          </div>
          <div class="form-field showcase-half">
            <label for="bdAssetLabel">Download label</label>
            <input pInputText id="bdAssetLabel" class="w-full" [(ngModel)]="band.assetLabel" placeholder="Download PDF guide" />
          </div>
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="scoringSaving()" (onClick)="bandVisible = false" />
          <p-button label="Save" icon="pi pi-check" [loading]="scoringSaving()" [disabled]="!band.label.trim()" (onClick)="saveBand()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="Rename score area" [(visible)]="groupVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <div class="form-field">
          <label for="grName">Name</label>
          <input pInputText id="grName" class="w-full" [(ngModel)]="groupName" />
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="scoringSaving()" (onClick)="groupVisible = false" />
          <p-button label="Save" icon="pi pi-check" [loading]="scoringSaving()" [disabled]="!groupName.trim()" (onClick)="saveGroupName()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
})
export class FormEditPage implements OnInit {
  readonly forms = inject(FormsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  readonly profile = formProfile(FREE_FORM_MODULE, null);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  form = signal<FreeFormDto | null>(null);
  error = signal<string | null>(null);
  saving = signal(false);
  publishing = signal(false);
  scoringSaving = signal(false);

  // Details and settings (Save)
  name = '';
  description = '';
  settings: Pick<FormSettings, 'review' | 'askOrganization' | 'askPhone' | 'resultsEmail'> = {
    review: true, askOrganization: false, askPhone: false, resultsEmail: false,
  };
  thankYou = '';
  ctaLabel = '';
  ctaUrl = '';
  private saved = '';

  // Scoring (saves right away)
  scoring = computed<FormScoring>(() => this.form()?.settings.scoring ?? { enabled: false, groups: [], bands: [] });
  newGroupName = '';
  groupVisible = false;
  editingGroup: FormScoreGroup | null = null;
  groupName = '';
  bandVisible = false;
  editingBand: FormScoreBand | null = null;
  band: FormScoreBand = this.blankBand();
  bandSteps = '';

  async ngOnInit() {
    try {
      this.apply(await this.forms.form(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load form');
    }
  }

  /** Field changes save on their own; reload without touching unsaved details or settings. */
  async reload() {
    try {
      this.form.set(await this.forms.form(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to reload form');
    }
  }

  private apply(f: FreeFormDto) {
    this.form.set(f);
    this.name = f.name;
    this.description = f.description ?? '';
    this.settings = { review: f.settings.review, askOrganization: f.settings.askOrganization, askPhone: f.settings.askPhone, resultsEmail: f.settings.resultsEmail };
    this.thankYou = f.settings.thankYou ?? '';
    this.ctaLabel = f.settings.cta?.label ?? '';
    this.ctaUrl = f.settings.cta?.url ?? '';
    this.saved = this.snapshot();
  }

  private snapshot() {
    return JSON.stringify({ n: this.name.trim(), d: this.description.trim(), s: this.settings, t: this.thankYou.trim(), cl: this.ctaLabel.trim(), cu: this.ctaUrl.trim() });
  }

  isDirty() {
    return this.snapshot() !== this.saved;
  }

  /** Settings to send: the edited ones plus the saved scoring. */
  private settingsBody(scoring: FormScoring = this.scoring()): FormSettings {
    const s = this.form()!.settings;
    return {
      ...s,
      ...this.settings,
      thankYou: this.thankYou.trim() || null,
      cta: this.ctaUrl.trim() ? { label: this.ctaLabel.trim() || 'Learn more', url: this.ctaUrl.trim() } : null,
      scoring,
    };
  }

  async save() {
    if (!this.name.trim()) {
      this.error.set('Name is required');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      this.apply(await this.forms.update(this.id, { name: this.name.trim(), description: this.description.trim() || null, settings: this.settingsBody() }));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: `${this.name.trim()} saved.` });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }

  async publish() {
    this.publishing.set(true);
    try {
      this.apply(await this.forms.publish(this.id));
      this.toast.add({ severity: 'success', summary: 'Published', detail: `Version ${this.form()?.published?.number} is live.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not publish', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.publishing.set(false);
    }
  }

  headerActions(): RowActionItem[] {
    const items: RowActionItem[] = [{ id: 'export', label: 'Export form file', icon: 'pi pi-download', command: () => void this.exportFile() }];
    if (this.form()?.canDelete) items.push({ id: 'delete', label: 'Delete form', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove() });
    return items;
  }

  /** Download the form (fields, settings, scoring) as a file that New form → form file can import, e.g. on another UBO. */
  async exportFile() {
    try {
      const def = await this.forms.export(this.id);
      const blob = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${def.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'form'}.ubo-form.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not export', detail: err instanceof Error ? err.message : 'Failed' });
    }
  }

  confirmRemove() {
    const f = this.form();
    if (!f) return;
    this.confirmDelete.confirm({
      message: `Delete "${f.name}"? Its links stop working and every submission is deleted. This cannot be undone.`,
      accept: async () => {
        try {
          await this.forms.remove(f.id);
          await this.router.navigate(['/forms']);
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not delete', detail: err instanceof Error ? err.message : 'Failed' });
        }
      },
    });
  }

  // ── Scoring ────────────────────────────────────────────────────────────────

  /** Save scoring right away; unsaved details and settings stay as they are on screen. */
  private async saveScoring(scoring: FormScoring) {
    const f = this.form();
    if (!f) return;
    this.scoringSaving.set(true);
    try {
      const updated = await this.forms.update(this.id, { settings: { ...f.settings, scoring } });
      this.form.set(updated);
      return true;
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save scoring', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
      return false;
    } finally {
      this.scoringSaving.set(false);
    }
  }

  setScoringEnabled(enabled: boolean) {
    void this.saveScoring({ ...this.scoring(), enabled });
  }

  groupFieldCount(groupId: string) {
    return (this.form()?.sections ?? []).flatMap((s) => s.fields).filter((f) => f.scoreGroupId === groupId).length;
  }

  async addGroup() {
    const name = this.newGroupName.trim();
    if (!name) return;
    if (await this.saveScoring({ ...this.scoring(), groups: [...this.scoring().groups, { id: newId(), name }] })) this.newGroupName = '';
  }

  groupActions(g: FormScoreGroup): RowActionItem[] {
    return [
      { id: 'edit', label: 'Rename', icon: 'pi pi-pencil', command: () => this.openGroup(g) },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteGroup(g) },
    ];
  }

  openGroup(g: FormScoreGroup) {
    this.editingGroup = g;
    this.groupName = g.name;
    this.groupVisible = true;
  }

  async saveGroupName() {
    const g = this.editingGroup;
    if (!g) return;
    const groups = this.scoring().groups.map((x) => (x.id === g.id ? { ...x, name: this.groupName.trim() } : x));
    if (await this.saveScoring({ ...this.scoring(), groups })) this.groupVisible = false;
  }

  confirmDeleteGroup(g: FormScoreGroup) {
    const n = this.groupFieldCount(g.id);
    this.confirmDelete.confirm({
      message: n
        ? `Delete "${g.name}"? Its ${n} ${n === 1 ? 'question still counts' : 'questions still count'} toward the overall score. This cannot be undone.`
        : `Delete "${g.name}"? This cannot be undone.`,
      accept: async () => {
        await this.saveScoring({ ...this.scoring(), groups: this.scoring().groups.filter((x) => x.id !== g.id) });
      },
    });
  }

  private blankBand(): FormScoreBand {
    return { id: '', label: '', upTo: 100, description: '', nextSteps: [], assetUrl: null, assetLabel: null };
  }

  /** "0–25%", "26–50%", …, the last one "76–100%". */
  bandRange(index: number) {
    const bands = this.scoring().bands;
    const from = index === 0 ? 0 : Math.floor(bands[index - 1].upTo) + 1;
    const to = index === bands.length - 1 ? 100 : bands[index].upTo;
    return `${from}–${to}%`;
  }

  bandActions(b: FormScoreBand): RowActionItem[] {
    return [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openBand(b) },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDeleteBand(b) },
    ];
  }

  openBand(b: FormScoreBand | null) {
    this.editingBand = b;
    this.band = b ? { ...b, assetUrl: b.assetUrl ?? '', assetLabel: b.assetLabel ?? '' } : this.blankBand();
    this.bandSteps = (b?.nextSteps ?? []).join('\n');
    this.bandVisible = true;
  }

  async saveBand() {
    const next: FormScoreBand = {
      ...this.band,
      id: this.editingBand?.id ?? newId(),
      label: this.band.label.trim(),
      upTo: Math.max(0, Math.min(100, Number(this.band.upTo) || 0)),
      description: this.band.description.trim(),
      nextSteps: this.bandSteps.split('\n').map((x) => x.trim()).filter(Boolean),
      assetUrl: this.band.assetUrl?.trim() || null,
      assetLabel: this.band.assetLabel?.trim() || null,
    };
    const others = this.scoring().bands.filter((x) => x.id !== next.id);
    const bands = [...others, next].sort((a, b) => a.upTo - b.upTo);
    if (await this.saveScoring({ ...this.scoring(), bands })) this.bandVisible = false;
  }

  confirmDeleteBand(b: FormScoreBand) {
    this.confirmDelete.confirm({
      message: `Delete the "${b.label}" profile? This cannot be undone.`,
      accept: async () => {
        await this.saveScoring({ ...this.scoring(), bands: this.scoring().bands.filter((x) => x.id !== b.id) });
      },
    });
  }
}
