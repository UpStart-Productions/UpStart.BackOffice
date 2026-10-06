import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { isStaffRole } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../core/tm-api.service';
import { TmStoreService } from '../core/tm-store.service';
import { TmProject, TmProjectListItem } from '../core/tm.types';
import { TmAddProjectDialogComponent } from '../ui/add-project-dialog.component';
import { TmProjectIconComponent } from '../ui/tm-project-icon.component';

/** Projects that have been added to Tasks: browse, star, add existing projects; archived toggle. */
@Component({
  selector: 'app-tm-projects-browser-page',
  standalone: true,
  imports: [TmProjectIconComponent, FormsModule, RouterLink, ButtonModule, TableModule, ToggleSwitchModule, IconFieldModule, InputIconModule, InputTextModule, TmAddProjectDialogComponent],
  template: `
    <div class="tm-page">
      <header class="tm-project-header">
        <div class="tm-project-title-row">
          <span class="tm-page-icon"><i class="pi pi-th-large"></i></span>
          <h1 class="tm-project-title">Projects</h1>
          <div class="tm-project-header-actions">
            <p-iconfield iconPosition="left" class="tm-toolbar-search">
              <p-inputicon><i class="pi pi-search"></i></p-inputicon>
              <input pInputText type="text" class="w-full" placeholder="Search projects or clients" [ngModel]="query()" (ngModelChange)="query.set($event)" aria-label="Search projects" />
            </p-iconfield>
            <label class="tm-toggle-label">
              <p-toggleswitch [ngModel]="showArchived()" (ngModelChange)="setArchived($event)" />
              Inactive
            </label>
            @if (isStaff()) {
              <p-button label="Add project" icon="pi pi-plus" (onClick)="newOpen.set(true)" />
            }
          </div>
        </div>
      </header>

      <div class="card tm-card-flush">
        <p-table [value]="filtered()" [loading]="loading()" sortField="name" [sortOrder]="1" styleClass="table-bordered" [rowHover]="true">
          <ng-template #header>
            <tr>
              <th style="width: 2.5rem"></th>
              <th pSortableColumn="name">Project <p-sortIcon field="name" /></th>
              <th pSortableColumn="client.name">Client <p-sortIcon field="client.name" /></th>
              <th pSortableColumn="openTaskCount" style="width: 9rem">Open tasks <p-sortIcon field="openTaskCount" /></th>
              <th pSortableColumn="memberCount" style="width: 8rem">Members <p-sortIcon field="memberCount" /></th>
              @if (isStaff()) { <th style="width: 7rem">Billable</th> }
            </tr>
          </ng-template>
          <ng-template #body let-p>
            <tr class="tm-browser-row" (click)="go(p)">
              <td>
                <button type="button" class="tm-icon-btn tm-star" [class.starred]="p.isStarred" (click)="star(p, $event)" [attr.aria-label]="p.isStarred ? 'Unstar' : 'Star'">
                  <i class="pi" [class.pi-star-fill]="p.isStarred" [class.pi-star]="!p.isStarred"></i>
                </button>
              </td>
              <td>
                <a [routerLink]="['/tasks/projects', p.id]" class="tm-browser-name" (click)="$event.stopPropagation()">
                  <app-tm-project-icon [color]="p.color" [icon]="p.icon" />{{ p.name }}
                </a>
                @if (!p.isActive) { <span class="tm-client-chip tm-client-chip--archived">Inactive</span> }
              </td>
              <td>{{ p.client?.name ?? 'Personal' }}</td>
              <td>{{ p.openTaskCount }}</td>
              <td>{{ p.memberCount }}</td>
              @if (isStaff()) {
                <td><i class="pi" [class.pi-check-circle]="p.isBillable" [class.pi-circle]="!p.isBillable"></i></td>
              }
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td [attr.colspan]="isStaff() ? 6 : 5" class="text-center p-4 text-color-secondary">{{ query() ? 'No projects match.' : 'No projects in Tasks yet — use Add project to bring one in.' }}</td></tr>
          </ng-template>
        </p-table>
      </div>
    </div>
    <app-tm-add-project-dialog [(visible)]="newOpen" (added)="onCreated($event)" />
  `,
})
export class ProjectsBrowserPage implements OnInit {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  projects = signal<TmProjectListItem[]>([]);
  loading = signal(true);
  query = signal('');
  showArchived = signal(false);
  newOpen = signal(false);

  readonly isStaff = computed(() => isStaffRole(this.session.me()?.role ?? 'GUEST'));
  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    // Keep star state in sync with the sidebar store.
    const starred = new Map(this.store.projects().map((p) => [p.id, p.isStarred]));
    return this.projects()
      .map((p) => ({ ...p, isStarred: starred.get(p.id) ?? p.isStarred }))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.client?.name ?? 'personal').toLowerCase().includes(q));
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.projects.set(await this.api.listProjects(this.showArchived()));
    } finally {
      this.loading.set(false);
    }
  }

  setArchived(v: boolean) {
    this.showArchived.set(v);
    void this.load();
  }

  go(p: TmProjectListItem) {
    void this.router.navigate(['/tasks/projects', p.id]);
  }

  async star(p: TmProjectListItem, event: Event) {
    event.stopPropagation();
    this.projects.update((list) => list.map((x) => (x.id === p.id ? { ...x, isStarred: !p.isStarred } : x)));
    await this.store.toggleStar(p);
  }

  async onCreated(project: TmProject) {
    await this.store.loadProjects();
    await this.router.navigate(['/tasks/projects', project.id]);
  }
}
