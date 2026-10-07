import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { map } from 'rxjs';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TmApiService } from '../core/tm-api.service';
import { FormAccess, TmForm, TmProject } from '../core/tm.types';
import { TmProjectIconComponent } from '../ui/tm-project-icon.component';
import { ACCESS_OPTIONS, accessIcon, accessLabel, formApiUrl, formPageUrl } from './form-links';

/** A project's intake forms. Each form creates tasks in the project. */
@Component({
  selector: 'app-tm-forms-list-page',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, SelectModule, TableModule, ToggleSwitchModule, TooltipModule, AppDialogModule, TmProjectIconComponent],
  template: `
    <div class="tm-page">
      <header class="tm-project-header">
        @if (project(); as p) {
          <a class="tm-back-link" [routerLink]="['/tasks/projects', p.id]">
            <app-tm-project-icon [color]="p.color" [icon]="p.icon" /> {{ p.name }}
          </a>
        }
        <div class="tm-project-title-row">
          <span class="tm-page-icon"><i class="pi pi-inbox"></i></span>
          <h1 class="tm-project-title">Forms</h1>
          <div class="tm-project-header-actions">
            @if (canEdit()) {
              <p-button label="New form" icon="pi pi-plus" (onClick)="openNew()" />
            }
          </div>
        </div>
        <p class="tm-muted tm-page-intro">Each submission becomes a task in this project.</p>
      </header>

      <div class="card tm-card-flush">
        <p-table [value]="forms()" [loading]="loading()" styleClass="table-bordered" [rowHover]="true">
          <ng-template #header>
            <tr>
              <th>Form</th>
              <th style="width: 15rem">Who can submit</th>
              <th style="width: 8rem">Submissions</th>
              <th style="width: 6rem">Active</th>
              <th style="width: 7rem"></th>
            </tr>
          </ng-template>
          <ng-template #body let-f>
            <tr class="tm-browser-row" (click)="open(f)">
              <td>
                <strong>{{ f.name }}</strong>
                <div class="tm-muted tm-form-slug">/f/{{ f.slug }}</div>
              </td>
              <td><span class="tm-access"><i class="pi" [class]="accessIcon(f.access)"></i> {{ accessLabel(f.access) }}</span></td>
              <td>{{ f.submissionCount }}</td>
              <td (click)="$event.stopPropagation()">
                <p-toggleswitch [ngModel]="f.isActive" (ngModelChange)="setActive(f, $event)" [disabled]="!canEdit()" [attr.aria-label]="'Active: ' + f.name" />
              </td>
              <td (click)="$event.stopPropagation()" class="tm-row-actions">
                <button type="button" class="tm-icon-btn" (click)="copyLink(f)" [pTooltip]="f.access === 'API_KEY' ? 'Copy API endpoint' : 'Copy link'" aria-label="Copy link"><i class="pi pi-link"></i></button>
                @if (f.access !== 'API_KEY') {
                  <a class="tm-icon-btn" [href]="pageUrl(f.slug)" target="_blank" rel="noopener" pTooltip="Open form" aria-label="Open form"><i class="pi pi-external-link"></i></a>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr>
              <td colspan="5" class="text-center p-4 text-color-secondary">
                No forms yet. Create one to collect bug reports, requests or intake info as tasks.
              </td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </div>

    <p-dialog header="New form" [(visible)]="newOpen" [modal]="true" [style]="{ width: '28rem' }" [draggable]="false">
      <form (ngSubmit)="create()">
        <div class="form-field mb-3">
          <label for="tm-form-name">Name</label>
          <input pInputText id="tm-form-name" name="name" class="w-full" [(ngModel)]="newName" placeholder="e.g. GrovLink bugs" autofocus />
        </div>
        <div class="form-field mb-3">
          <label for="tm-form-access">Who can submit</label>
          <p-select inputId="tm-form-access" name="access" [options]="accessOptions" optionLabel="label" optionValue="value" [(ngModel)]="newAccess" styleClass="w-full" appendTo="body">
            <ng-template #item let-o>
              <div class="tm-access-option"><span><i class="pi" [class]="o.icon"></i> {{ o.label }}</span><small class="tm-muted">{{ o.hint }}</small></div>
            </ng-template>
          </p-select>
        </div>
        <div class="form-actions">
          <button type="button" pButton label="Cancel" severity="secondary" (click)="newOpen = false"></button>
          <button type="submit" pButton label="Create form" [loading]="saving()" [disabled]="!newName.trim() || saving()"></button>
        </div>
      </form>
    </p-dialog>
  `,
})
export class FormsListPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(TmApiService);
  private readonly toast = inject(MessageService);

  readonly projectId = toSignal(this.route.paramMap.pipe(map((p) => p.get('projectId')!)), {
    initialValue: this.route.snapshot.paramMap.get('projectId')!,
  });
  project = signal<TmProject | null>(null);
  forms = signal<TmForm[]>([]);
  loading = signal(true);
  saving = signal(false);
  newOpen = false;
  newName = '';
  newAccess: FormAccess = 'COLLABORATORS';

  readonly canEdit = computed(() => !!this.project()?.permissions.canEdit);
  readonly accessOptions = ACCESS_OPTIONS;
  readonly accessLabel = accessLabel;
  readonly accessIcon = accessIcon;
  readonly pageUrl = formPageUrl;

  constructor() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [project, forms] = await Promise.all([this.api.getProject(this.projectId()), this.api.listForms(this.projectId())]);
      this.project.set(project);
      this.forms.set(forms);
    } catch (err) {
      this.fail(err);
    } finally {
      this.loading.set(false);
    }
  }

  openNew() {
    this.newName = '';
    this.newAccess = 'COLLABORATORS';
    this.newOpen = true;
  }

  async create() {
    if (!this.newName.trim()) return;
    this.saving.set(true);
    try {
      const form = await this.api.createForm(this.projectId(), { name: this.newName.trim(), access: this.newAccess });
      this.newOpen = false;
      await this.router.navigate(['/tasks/projects', this.projectId(), 'forms', form.id]);
    } catch (err) {
      this.fail(err);
    } finally {
      this.saving.set(false);
    }
  }

  open(f: TmForm) {
    void this.router.navigate(['/tasks/projects', this.projectId(), 'forms', f.id]);
  }

  async setActive(f: TmForm, isActive: boolean) {
    this.forms.update((list) => list.map((x) => (x.id === f.id ? { ...x, isActive } : x)));
    try {
      await this.api.updateForm(f.id, { isActive });
    } catch (err) {
      this.forms.update((list) => list.map((x) => (x.id === f.id ? { ...x, isActive: f.isActive } : x)));
      this.fail(err);
    }
  }

  async copyLink(f: TmForm) {
    const url = f.access === 'API_KEY' ? formApiUrl(f.slug) : formPageUrl(f.slug);
    try {
      await navigator.clipboard.writeText(url);
      this.toast.add({ severity: 'success', summary: 'Copied', detail: url, life: 2500 });
    } catch {
      this.toast.add({ severity: 'info', summary: 'Link', detail: url });
    }
  }

  private fail(err: unknown) {
    this.toast.add({ severity: 'error', summary: 'Something went wrong', detail: err instanceof Error ? err.message : String(err) });
  }
}
