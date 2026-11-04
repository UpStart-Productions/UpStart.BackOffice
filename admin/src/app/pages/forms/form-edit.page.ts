import { Component, computed, effect, inject, OnInit, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { QuillModule } from 'ngx-quill';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectButtonModule } from 'primeng/selectbutton';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import {
  areaEnabled, htmlHasText, FORM_CLIENT_COPIES_LABELS, FORM_LAYOUT_LABELS, FREE_FORM_MODULE, formProfile, type FormAccess, type FormAccessLevel, type FormClientCopies, type FormClientSettings,
  type FormLayout, type FormScoreBand, type FormScoreBandAssetKind, type FormScoreGroup, type FormScoring, type FormSettings, type FreeFormDto, type FormDefinition,
} from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { fileIconClass, isPdfFile, isRasterImage } from '../../core/file-type.util';
import { downloadFormFile, readFormFile } from '../../core/form-file.util';
import { FileViewerDialogComponent, type ViewerFile } from '../../ui/file-viewer/file-viewer-dialog.component';
import { SingleFileDropzoneComponent } from '../../ui/single-file-dropzone/single-file-dropzone.component';
import { freeFormWorkspace } from './form-workspace.config';
import { FormsApi } from '../../core/forms.api';
import { FormWorkspaceService } from '../../core/form-workspace.service';
import { FormBuilderComponent } from '../../ui/form-builder/form-builder.component';
import { FormLinksComponent } from '../../ui/form-builder/form-links.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

const newId = () => Math.random().toString(36).slice(2, 10);

const PROFILE_RESOURCE_ACCEPT =
  '.pdf,.doc,.docx,.txt,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
const PROFILE_RESOURCE_MAX_BYTES = 50 * 1024 * 1024;

/**
 * One free-standing form: details and settings (Save), scoring and fields (save right away), Publish, public links.
 * Public links serve the published version, so changes reach respondents when the form is published again.
 */
@Component({
  selector: 'app-form-edit-page',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    CheckboxModule,
    SelectButtonModule,
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
    RowActionsMenuComponent,
    RouterLink,
    SingleFileDropzoneComponent,
    QuillModule,
    FileViewerDialogComponent,
  ],
  styles: `
    .profile-resource-cell {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      max-width: 100%;
    }
    .profile-resource-icon {
      flex-shrink: 0;
      color: var(--text-color-secondary);
    }
    .profile-resource-link {
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
  template: `
    <header class="page-header">
      <div class="page-header-row">
        <p-button
          icon="pi pi-arrow-left"
          [rounded]="true"
          [text]="true"
          severity="secondary"
          type="button"
          class="page-header-back"
          routerLink="/forms"
          ariaLabel="Back to Forms"
        />
        <div class="page-header-title-block">
          <h1 class="page-title page-header-title">
            {{ form()?.name ?? 'Form' }}
            <app-help-text key="forms.form.page" />
          </h1>
        </div>
        @if (form(); as f) {
          <div class="page-header-meta">
            @if (!f.published) {
              <p-tag value="Draft" severity="secondary" />
            } @else if (f.hasUnpublishedChanges) {
              <p-tag value="Changes not published" severity="warn" />
            } @else {
              <p-tag value="Published" severity="success" />
            }
          </div>
          <div class="page-header-actions">
            <app-row-actions-menu [items]="headerActions()" ariaLabel="Form actions" />
            @if (f.canEdit) {
              @if (f.published && !f.hasUnpublishedChanges) {
                <p-button label="Unpublish" icon="pi pi-eye-slash" severity="secondary" [outlined]="true" [loading]="publishing()" (onClick)="confirmUnpublish()" />
              } @else {
                <p-button
                  [label]="f.published ? 'Publish changes' : 'Publish'"
                  icon="pi pi-send"
                  severity="secondary"
                  [outlined]="true"
                  [loading]="publishing()"
                  [disabled]="isDirty()"
                  (onClick)="publish()"
                />
              }
            }
            <p-button label="Preview" icon="pi pi-eye" severity="secondary" [outlined]="true" (onClick)="openPreview()" />
            @if (f.canEdit) {
              <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!isDirty()" (onClick)="save()" />
            }
          </div>
        }
      </div>
    </header>

      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }

      @if (form(); as f) {
        <div class="stack">
          @switch (view()) {
            @case ('settings') {
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
              <div class="form-field">
                <label for="ffUsedFor">Used for <app-help-text key="forms.form.usedFor" /></label>
                <input pInputText id="ffUsedFor" class="w-full" [(ngModel)]="usedFor" [disabled]="!f.canEdit" maxlength="80" />
              </div>
              <div class="form-field">
                <label>How sections are shown <app-help-text key="forms.form.layout" /></label>
                <p-selectbutton [options]="layoutOptions" optionLabel="label" optionValue="value" [(ngModel)]="layout" [allowEmpty]="false" [disabled]="!f.canEdit" />
              </div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffReview" [binary]="true" [(ngModel)]="settings.review" [disabled]="!f.canEdit" />
                <label for="ffReview">Review submissions before accepting them <app-help-text key="forms.form.review" /></label>
              </div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffEmail" [binary]="true" [(ngModel)]="settings.resultsEmail" [disabled]="!f.canEdit" />
                <label for="ffEmail">Email people their results <app-help-text key="forms.form.resultsEmail" /></label>
              </div>
              @if (settings.resultsEmail) {
                <div class="form-field">
                  <label for="ffEmailTemplate">Email template (optional) <app-help-text key="forms.form.resultsEmailTemplate" /></label>
                  <input pInputText id="ffEmailTemplate" class="w-full" [(ngModel)]="resultsEmailTemplate" [disabled]="!f.canEdit" placeholder="e.g. mtc_results" maxlength="64" />
                </div>
              }
              <div class="form-field">
                <label>Thank-you message <app-help-text key="forms.form.thankYou" /></label>
                <quill-editor [(ngModel)]="thankYou" [readOnly]="!f.canEdit" placeholder="Thanks! Your answers were sent." [styles]="{ 'min-height': '120px' }"></quill-editor>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3 class="card-title">Client form <app-help-text key="forms.form.client" /></h3></div>
            <div class="showcase-flex-col">
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffClient" [binary]="true" [(ngModel)]="client.enabled" [disabled]="!f.canEdit" />
                <label for="ffClient">Attach answers to a client</label>
              </div>
              @if (client.enabled) {
                <div class="form-field">
                  <label>Copies per client <app-help-text key="forms.form.copies" /></label>
                  <p-selectbutton [options]="copiesOptions" optionLabel="label" optionValue="value" [(ngModel)]="client.copies" [allowEmpty]="false" [disabled]="!f.canEdit" />
                </div>
              }
            </div>
          </div>

          @if (careOn()) {
            <div class="card">
              <div class="card-header"><h3 class="card-title">Care</h3></div>
              <div class="flex align-items-center gap-2">
                <p-checkbox inputId="ffVisit" [binary]="true" [(ngModel)]="visitChecklist" [disabled]="!f.canEdit" />
                <label for="ffVisit">Use as the visit checklist <app-help-text key="forms.form.visitChecklist" /></label>
              </div>
            </div>
          }

            }
            @case ('scoring') {
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
                  <tr><th style="width: 3rem"></th><th>Profile</th><th>Score range</th><th>Next steps</th><th>Resource</th></tr>
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
                    <td>
                      @if (b.assetUrl) {
                        <span class="profile-resource-cell">
                          <i class="pi {{ profileResourceIcon(b) }} profile-resource-icon" aria-hidden="true"></i>
                          <a
                            class="text-primary profile-resource-link"
                            [href]="profileResourceHref(b) ?? '#'"
                            (click)="openProfileResource(b, $event)"
                          >{{ profileResourceTitle(b) }}</a>
                        </span>
                      }
                    </td>
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr><td colspan="5">No profiles yet. People see their percentage only.</td></tr>
                </ng-template>
              </p-table>
            }
          </div>

            }
            @case ('access') {
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Who can use it <app-help-text key="forms.form.access" /></h3>
            </div>
            @if (!client.enabled) {
              <p class="mt-0">Applies when the form is a client form (Settings → Attach answers to a client).</p>
            }
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
                      [disabled]="!f.canEdit"
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
            @case ('links') {
          <div class="card">
            <app-form-links [apiBase]="forms.base" [formId]="f.id" title="Public links" helpKey="forms.form.links" />
          </div>
            }
            @default {
          @if (currentSection(); as sec) {
            <div class="card">
              @if (f.canEdit) {
                <app-form-builder
                  [form]="f"
                  [profile]="profile"
                  [apiBase]="forms.base"
                  [sectionId]="sec.id"
                  [scoreGroups]="scoring().enabled ? scoring().groups : []"
                  (changed)="reload()"
                />
              } @else {
                <p class="m-0">Your role can view this form but not change it.</p>
              }
            </div>
          }
            }
          }
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
        <div class="form-field mt-3">
          <div class="flex align-items-center gap-2 mb-2">
            <span class="font-medium">Profile resource</span>
            <app-help-text key="forms.form.profileResource" />
            <span class="flex-1"></span>
            <p-selectbutton
              [options]="profileResourceKindOptions"
              optionLabel="label"
              optionValue="value"
              [(ngModel)]="profileResourceKind"
              (ngModelChange)="onProfileResourceKindChange($event)"
              [allowEmpty]="false"
              size="small"
            />
          </div>
          @if (profileResourceKind === 'link') {
            <div class="showcase-row">
              <div class="form-field showcase-half">
                <label for="bdAssetUrl">URL</label>
                <input pInputText id="bdAssetUrl" class="w-full" [(ngModel)]="band.assetUrl" placeholder="https://…/guide.pdf" />
              </div>
              <div class="form-field showcase-half">
                <label for="bdAssetLabel">Label</label>
                <input pInputText id="bdAssetLabel" class="w-full" [(ngModel)]="band.assetLabel" placeholder="Download PDF guide" />
              </div>
            </div>
          } @else {
            <div class="form-field">
              <label>File</label>
              <app-single-file-dropzone
                #profileResourceDrop
                [fill]="true"
                [accept]="profileResourceAccept"
                [maxBytes]="profileResourceMaxBytes"
                emptyTitle="Profile resource"
                emptyHint="Drop a file or click to browse"
                selectedTitle="Profile resource"
                emptyIcon="pi-file-pdf"
                [existingUrl]="existingProfileResourceUrl()"
                (fileChange)="onProfileResourceFile($event)"
                (invalidFile)="onProfileResourceInvalid($event)"
              />
              @if (profileResourceError()) {
                <small class="text-red-600">{{ profileResourceError() }}</small>
              }
            </div>
            <div class="form-field mt-3">
              <label for="bdAssetLabelFile">Label</label>
              <input pInputText id="bdAssetLabelFile" class="w-full" [(ngModel)]="band.assetLabel" placeholder="Download PDF guide" />
            </div>
          }
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="scoringSaving()" (onClick)="bandVisible = false" />
          <p-button label="Save" icon="pi pi-check" [loading]="scoringSaving()" [disabled]="!band.label.trim()" (onClick)="saveBand()" />
        </ng-template>
      </p-dialog>

      <p-dialog header="Import form file" [(visible)]="importVisible" [modal]="true" [style]="{ width: 'min(28rem, 96vw)' }">
        <p class="mt-0">The file's sections and questions are added after this form's current ones. Nothing already on the form changes, including its answers, name and settings.</p>
        <app-single-file-dropzone
          #importDrop
          accept=".json,application/json"
          [maxBytes]="2 * 1024 * 1024"
          emptyTitle="Form file"
          emptyHint="Drop a form file (.json) or click to browse"
          selectedTitle="Form file"
          emptyIcon="pi-file-import"
          (fileChange)="readImport($event)"
          (invalidFile)="importError.set($event)"
        />
        @if (importError()) {
          <small class="text-red-600">{{ importError() }}</small>
        } @else if (importDef(); as def) {
          <small>Adds {{ importFieldCount() }} fields in {{ def.sections.length }} sections</small>
        }
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="importing()" (onClick)="importVisible = false" />
          <p-button label="Add to form" icon="pi pi-check" [loading]="importing()" [disabled]="!importDef() || !!importError()" (onClick)="importFile()" />
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

      <app-file-viewer-dialog [file]="profileResourceViewer()" (closed)="profileResourceViewer.set(null)" />
  `,
})
export class FormEditPage implements OnInit {
  readonly forms = inject(FormsApi);
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);
  private readonly ws = inject(FormWorkspaceService);
  private readonly session = inject(SessionService);

  readonly copiesOptions = (Object.keys(FORM_CLIENT_COPIES_LABELS) as FormClientCopies[]).map((value) => ({ value, label: FORM_CLIENT_COPIES_LABELS[value] }));
  readonly levelOptions: { value: FormAccessLevel | 'none'; label: string }[] = [
    { value: 'none', label: 'None' },
    { value: 'read', label: 'Read' },
    { value: 'edit', label: 'Edit' },
  ];
  /** The Care module is on (visit checklist setting). */
  readonly careOn = computed(() => areaEnabled(this.session.me()?.modules, 'visits'));

  readonly layoutOptions = (Object.keys(FORM_LAYOUT_LABELS) as FormLayout[]).map((value) => ({ value, label: FORM_LAYOUT_LABELS[value] }));
  private readonly query = toSignal(this.route.queryParamMap);
  /** What the main area shows (sidebar picks it): settings, scoring, links, or a section id. Default: the first section. */
  readonly view = computed(() => {
    const f = this.form();
    const v = this.query()?.get('view');
    if (v === 'settings' || v === 'scoring' || v === 'links' || v === 'access') return v;
    if (v && f?.sections.some((x) => x.id === v)) return v;
    return f?.sections[0]?.id ?? 'settings';
  });
  readonly currentSection = computed(() => this.form()?.sections.find((x) => x.id === this.view()) ?? null);

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
  layout: FormLayout = 'page';
  settings: Pick<FormSettings, 'review' | 'resultsEmail'> = {
    review: true, resultsEmail: false,
  };
  thankYou: string | null = '';
  resultsEmailTemplate = '';
  client: FormClientSettings = { enabled: false, copies: 'each' };
  usedFor = '';
  visitChecklist = false;
  roles = signal<{ id: string; name: string }[]>([]);
  levels = signal<FormAccess>({});
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
  readonly profileResourceKindOptions: { value: FormScoreBandAssetKind; label: string }[] = [
    { value: 'link', label: 'Link' },
    { value: 'file', label: 'File' },
  ];
  readonly profileResourceAccept = PROFILE_RESOURCE_ACCEPT;
  readonly profileResourceMaxBytes = PROFILE_RESOURCE_MAX_BYTES;
  profileResourceKind: FormScoreBandAssetKind = 'link';
  profileResourceFile: File | null = null;
  profileResourceError = signal<string | null>(null);
  profileResourceViewer = signal<ViewerFile | null>(null);
  private readonly profileResourceDropzone = viewChild<SingleFileDropzoneComponent>('profileResourceDrop');
  bandSteps = '';

  constructor() {
    // The sidebar added a section: show the fresh form.
    effect(() => {
      if (this.ws.changed()) void this.reload();
    });
  }

  async ngOnInit() {
    this.ws.open(this.id, freeFormWorkspace(this.forms, this.id));
    this.forms.roles().then((r) => this.roles.set(r), () => this.roles.set([]));
    try {
      this.apply(await this.forms.form(this.id));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load form');
    }
  }

  /** Field changes save on their own; reload without touching unsaved details or settings. */
  async reload() {
    try {
      const f = await this.forms.form(this.id);
      this.form.set(f);
      this.ws.form.set(f);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to reload form');
    }
  }

  private apply(f: FreeFormDto) {
    this.form.set(f);
    this.ws.form.set(f);
    this.layout = f.settings.layout;
    this.name = f.name;
    this.description = f.description ?? '';
    this.settings = { review: f.settings.review, resultsEmail: f.settings.resultsEmail };
    this.thankYou = f.settings.thankYou ?? '';
    this.resultsEmailTemplate = f.settings.resultsEmailTemplate ?? '';
    this.client = { enabled: f.settings.client.enabled, copies: f.settings.client.copies };
    this.usedFor = f.settings.usedFor ?? '';
    this.visitChecklist = f.settings.visitChecklist;
    this.levels.set({ ...f.access });
    this.saved = this.snapshot();
  }

  private snapshot() {
    return JSON.stringify({
      n: this.name.trim(), d: this.description.trim(), l: this.layout, s: this.settings, t: this.thankYouValue(), et: this.resultsEmailTemplate.trim(),
      c: this.client, u: this.usedFor.trim(), v: this.visitChecklist, a: this.levels(),
    });
  }

  /** The thank-you as saved: the editor's HTML, or null when it has no words. */
  private thankYouValue() {
    return htmlHasText(this.thankYou) ? (this.thankYou ?? '').trim() : null;
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
      layout: this.layout,
      thankYou: this.thankYouValue(),
      resultsEmailTemplate: this.resultsEmailTemplate.trim() || null,
      client: { ...this.client },
      usedFor: this.usedFor.trim() || null,
      visitChecklist: this.visitChecklist,
      scoring,
    };
  }

  setLevel(roleId: string, level: FormAccessLevel | 'none') {
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
      this.apply(
        await this.forms.update(this.id, { name: this.name.trim(), description: this.description.trim() || null, settings: this.settingsBody(), access: this.levels() }),
      );
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

  /** Take the form offline: its links stop working until it is published again. Versions and submissions stay. */
  confirmUnpublish() {
    this.confirmDelete.confirm({
      header: 'Unpublish form',
      message: 'Unpublish this form? Its links and embeds stop working until you publish it again. Submissions are kept.',
      acceptLabel: 'Unpublish',
      accept: async () => {
        this.publishing.set(true);
        try {
          this.apply(await this.forms.unpublish(this.id));
          this.toast.add({ severity: 'success', summary: 'Unpublished', detail: 'The form is offline.' });
        } catch (err) {
          this.toast.add({ severity: 'error', summary: 'Could not unpublish', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
        } finally {
          this.publishing.set(false);
        }
      },
    });
  }

  openPreview() {
    window.open(`/forms/${this.id}/preview`, '_blank', 'noopener');
  }

  // Import form file (adds sections after the form's own)
  importVisible = false;
  readonly importDef = signal<FormDefinition | null>(null);
  readonly importError = signal('');
  readonly importing = signal(false);
  private readonly importDrop = viewChild<SingleFileDropzoneComponent>('importDrop');

  openImport() {
    this.importDef.set(null);
    this.importError.set('');
    this.importDrop()?.reset();
    this.importVisible = true;
  }

  async readImport(file: File | null) {
    this.importDef.set(null);
    this.importError.set('');
    if (!file) return;
    try {
      this.importDef.set(await readFormFile(file));
    } catch (err) {
      this.importError.set(err instanceof Error ? err.message : 'That file could not be read.');
    }
  }

  importFieldCount() {
    return this.importDef()?.sections.reduce((n, s) => n + s.fields.length, 0) ?? 0;
  }

  async importFile() {
    const def = this.importDef();
    if (!def) return;
    this.importing.set(true);
    try {
      const r = await this.forms.importInto(this.id, def);
      this.importVisible = false;
      await this.reload();
      this.toast.add({ severity: 'success', summary: 'Imported', detail: `Added ${r.fields} fields in ${r.sections} sections.` });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not import', detail: err instanceof Error ? err.message.replace(/^API error \d+: /, '') : 'Failed' });
    } finally {
      this.importing.set(false);
    }
  }

  headerActions(): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'preview', label: 'Preview', icon: 'pi pi-eye', command: () => this.openPreview() },
      { id: 'export', label: 'Export form file', icon: 'pi pi-download', command: () => void this.exportFile() },
    ];
    const f = this.form();
    if (f?.canEdit) items.splice(1, 0, { id: 'import', label: 'Import form file', icon: 'pi pi-file-import', command: () => this.openImport() });
    // With changes waiting, the header button publishes them; Unpublish moves here.
    if (f?.canEdit && f.published && f.hasUnpublishedChanges) {
      items.push({ id: 'unpublish', label: 'Unpublish', icon: 'pi pi-eye-slash', command: () => this.confirmUnpublish() });
    }
    if (this.form()?.canDelete) items.push({ id: 'delete', label: 'Delete form', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmRemove() });
    return items;
  }

  /** Download the form (fields, settings, scoring) as a file that New form → form file can import, e.g. on another UBO. */
  async exportFile() {
    try {
      downloadFormFile(await this.forms.export(this.id));
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
      this.ws.form.set(updated);
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
    return { id: '', label: '', upTo: 100, description: '', nextSteps: [], assetKind: null, assetUrl: null, assetLabel: null };
  }

  profileResourceTitle(b: FormScoreBand): string {
    if (!b.assetUrl) return '';
    return b.assetLabel?.trim() || (this.profileResourceStorageKind(b) === 'file' ? 'File' : 'Link');
  }

  profileResourceStorageKind(b: FormScoreBand): 'link' | 'file' {
    if (b.assetKind === 'file' || b.assetUrl?.startsWith('/api/uploads/')) return 'file';
    return 'link';
  }

  profileResourceIcon(b: FormScoreBand): string {
    if (this.profileResourceStorageKind(b) === 'link') return 'pi-link';
    return fileIconClass(this.profileResourceFileName(b), null);
  }

  profileResourceFileName(b: FormScoreBand): string {
    const label = b.assetLabel?.trim();
    if (label) return label;
    const url = b.assetUrl?.trim() ?? '';
    const path = url.split('?')[0] ?? '';
    const seg = path.split('/').pop();
    return seg || 'File';
  }

  profileResourceHref(b: FormScoreBand): string | null {
    const url = b.assetUrl?.trim();
    if (!url) return null;
    if (this.profileResourceStorageKind(b) === 'link') return url;
    return resolveAssetUrl(url);
  }

  openProfileResource(b: FormScoreBand, event: MouseEvent) {
    const href = this.profileResourceHref(b);
    if (!href) return;
    if (this.profileResourceStorageKind(b) === 'link') {
      event.preventDefault();
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
    const name = this.profileResourceFileName(b);
    const pdf = isPdfFile(name, null) || isPdfFile(href, null);
    const image = isRasterImage(name, null) || isRasterImage(href, null);
    if (pdf || image) {
      event.preventDefault();
      this.profileResourceViewer.set({ name, kind: pdf ? 'pdf' : 'image', url: href });
      return;
    }
    event.preventDefault();
    void this.downloadProfileResource(href, name);
  }

  private async downloadProfileResource(url: string, name: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = name;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Download failed',
        detail: err instanceof Error ? err.message : 'Could not download the file',
      });
    }
  }

  existingProfileResourceUrl(): string | null {
    const url = this.band.assetUrl?.trim();
    if (!url) return null;
    if (this.profileResourceKind !== 'file') return null;
    if (url.startsWith('/api/uploads/') || this.band.assetKind === 'file') return url;
    return null;
  }

  onProfileResourceKindChange(kind: FormScoreBandAssetKind) {
    this.profileResourceKind = kind;
    this.profileResourceError.set(null);
    this.profileResourceFile = null;
    this.profileResourceDropzone()?.clear();
    if (kind === 'link' && (this.band.assetKind === 'file' || this.band.assetUrl?.startsWith('/api/uploads/'))) {
      this.band.assetUrl = '';
    }
    if (kind === 'file' && this.band.assetKind === 'link' && this.band.assetUrl && !this.band.assetUrl.startsWith('/api/uploads/')) {
      this.band.assetUrl = '';
    }
  }

  onProfileResourceFile(file: File | null) {
    this.profileResourceFile = file;
    this.profileResourceError.set(null);
  }

  onProfileResourceInvalid(message: string) {
    this.profileResourceError.set(message);
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
    this.profileResourceKind =
      b?.assetKind === 'file' || b?.assetKind === 'link'
        ? b.assetKind
        : b?.assetUrl?.startsWith('/api/uploads/')
          ? 'file'
          : 'link';
    this.profileResourceFile = null;
    this.profileResourceError.set(null);
    this.bandVisible = true;
  }

  async saveBand() {
    this.profileResourceError.set(null);
    let assetUrl = this.band.assetUrl?.trim() || null;
    let assetKind: FormScoreBandAssetKind | null = null;

    if (this.profileResourceKind === 'link') {
      assetKind = assetUrl ? 'link' : null;
    } else {
      if (this.profileResourceFile) {
        try {
          const res = await this.api.uploadFile<{ url: string }>('/uploads/content-file', this.profileResourceFile);
          assetUrl = res.url?.trim() || null;
          assetKind = assetUrl ? 'file' : null;
        } catch (err) {
          this.profileResourceError.set(err instanceof Error ? err.message : 'Upload failed');
          return;
        }
      } else if (assetUrl?.startsWith('/api/uploads/')) {
        assetKind = 'file';
      } else {
        assetUrl = null;
        assetKind = null;
      }
    }

    const next: FormScoreBand = {
      ...this.band,
      id: this.editingBand?.id ?? newId(),
      label: this.band.label.trim(),
      upTo: Math.max(0, Math.min(100, Number(this.band.upTo) || 0)),
      description: this.band.description.trim(),
      nextSteps: this.bandSteps.split('\n').map((x) => x.trim()).filter(Boolean),
      assetKind,
      assetUrl,
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
