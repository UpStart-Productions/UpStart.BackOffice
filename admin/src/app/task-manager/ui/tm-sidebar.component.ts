import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { isStaffRole } from '@upstart/back-office/shared';
import { SessionService } from '../../core/session.service';
import { TmStoreService } from '../core/tm-store.service';
import { TmProject, TmProjectListItem } from '../core/tm.types';
import { TmNewProjectDialogComponent } from './new-project-dialog.component';

/** Asana-style Task Manager navigation: My tasks, Inbox, Projects, Starred and the project list. */
@Component({
  selector: 'app-tm-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TmNewProjectDialogComponent],
  template: `
    <nav class="tm-sidebar" aria-label="Task Manager">
      <ul class="tm-nav">
        <li>
          <a routerLink="/my-tasks" routerLinkActive="active" class="tm-nav-link">
            <i class="pi pi-check-circle"></i><span>My tasks</span>
          </a>
        </li>
        <li>
          <a routerLink="/inbox" routerLinkActive="active" class="tm-nav-link">
            <i class="pi pi-inbox"></i><span>Inbox</span>
            @if (store.unreadCount() > 0) {
              <span class="tm-nav-badge" [attr.aria-label]="store.unreadCount() + ' unread'">{{ store.unreadCount() > 99 ? '99+' : store.unreadCount() }}</span>
            }
          </a>
        </li>
        <li>
          <a routerLink="/projects" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" class="tm-nav-link">
            <i class="pi pi-th-large"></i><span>Projects</span>
          </a>
        </li>
      </ul>

      @if (store.starred().length) {
        <div class="tm-nav-group">
          <button type="button" class="tm-nav-group-header" (click)="starredOpen.set(!starredOpen())" [attr.aria-expanded]="starredOpen()">
            <i class="pi" [class.pi-chevron-down]="starredOpen()" [class.pi-chevron-right]="!starredOpen()"></i>
            <span>Starred</span>
          </button>
          @if (starredOpen()) {
            <ul class="tm-nav">
              @for (p of store.starred(); track p.id) {
                <li>
                  <a [routerLink]="['/projects', p.id]" routerLinkActive="active" class="tm-nav-link tm-nav-project">
                    <span class="tm-project-dot" [style.background]="p.color || '#94a3b8'"></span>
                    <span class="tm-nav-label">{{ p.name }}</span>
                  </a>
                </li>
              }
            </ul>
          }
        </div>
      }

      <div class="tm-nav-group">
        <div class="tm-nav-group-header-row">
          <button type="button" class="tm-nav-group-header" (click)="projectsOpen.set(!projectsOpen())" [attr.aria-expanded]="projectsOpen()">
            <i class="pi" [class.pi-chevron-down]="projectsOpen()" [class.pi-chevron-right]="!projectsOpen()"></i>
            <span>Projects</span>
          </button>
          @if (canCreate()) {
            <button type="button" class="tm-icon-btn" (click)="newProjectOpen.set(true)" title="New project" aria-label="New project">
              <i class="pi pi-plus"></i>
            </button>
          }
        </div>
        @if (projectsOpen()) {
          <ul class="tm-nav">
            @for (p of sortedProjects(); track p.id) {
              <li>
                <a [routerLink]="['/projects', p.id]" routerLinkActive="active" class="tm-nav-link tm-nav-project">
                  <span class="tm-project-dot" [style.background]="p.color || '#94a3b8'"></span>
                  <span class="tm-nav-label">{{ p.name }}</span>
                </a>
              </li>
            } @empty {
              @if (store.projectsLoaded()) {
                <li class="tm-nav-empty">No projects yet</li>
              }
            }
          </ul>
        }
      </div>
    </nav>
    <app-tm-new-project-dialog [(visible)]="newProjectOpen" (created)="onCreated($event)" />
  `,
})
export class TmSidebarComponent implements OnInit, OnDestroy {
  readonly store = inject(TmStoreService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  starredOpen = signal(true);
  projectsOpen = signal(true);
  newProjectOpen = signal(false);

  canCreate = computed(() => isStaffRole(this.session.me()?.role ?? 'GUEST'));
  sortedProjects = computed<TmProjectListItem[]>(() =>
    [...this.store.projects()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  ngOnInit() {
    if (!this.store.projectsLoaded()) void this.store.loadProjects();
    this.store.startPolling();
  }

  ngOnDestroy() {
    this.store.stopPolling();
  }

  async onCreated(project: TmProject) {
    await this.store.loadProjects();
    await this.router.navigate(['/projects', project.id]);
  }
}
