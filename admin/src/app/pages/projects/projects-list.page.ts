import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ToolbarSearchFieldComponent } from '../../ui/toolbar-search-field/toolbar-search-field.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';

type Project = { id: string; name: string; isBillable: boolean; isActive: boolean; hourlyRate?: number; client: { id: string; name: string } | null };

const SHOW_INACTIVE_KEY = 'ubo-projects-show-inactive:v1';

@Component({
  selector: 'app-projects-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ToolbarSearchFieldComponent,
    TableModule,
    MessageModule,
    TagModule,
    ToggleSwitchModule,
    PageComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './projects-list.page.html',
  styles: [
    `
      .projects-list-inactive-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        font-size: var(--fs-sm);
        user-select: none;
      }
    `,
  ],
})
export class ProjectsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly session = inject(SessionService);

  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  /** When off, inactive projects are hidden from the table (default). */
  showInactive = signal(false);
  searchQuery = '';
  searchDebounced = signal('');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredProjects = computed(() => {
    let list = this.projects();
    if (!this.showInactive()) {
      list = list.filter((p) => p.isActive);
    }
    const q = this.searchDebounced().trim().toLowerCase();
    if (!q) return list;
    return list.filter((project) => this.projectMatchesSearch(project, q));
  });

  readonly emptyMessage = computed(() => {
    const q = this.searchDebounced().trim();
    const visible = this.showInactive()
      ? this.projects()
      : this.projects().filter((p) => p.isActive);
    if (q && this.filteredProjects().length === 0 && visible.length > 0) {
      return 'No projects match your search.';
    }
    if (!this.showInactive() && visible.length === 0 && this.projects().length > 0) {
      return 'No active projects. Turn on Show inactive projects to see archived ones.';
    }
    return 'No projects yet.';
  });

  async ngOnInit() {
    this.loadShowInactivePref();
    await this.load();
  }

  setShowInactive(value: boolean) {
    this.showInactive.set(value);
    try {
      localStorage.setItem(this.showInactiveStorageKey(), value ? 'true' : 'false');
    } catch {
      // Preference won't persist.
    }
  }

  private loadShowInactivePref() {
    try {
      this.showInactive.set(localStorage.getItem(this.showInactiveStorageKey()) === 'true');
    } catch {
      // Ignore bad stored data.
    }
  }

  private showInactiveStorageKey(): string {
    return `${SHOW_INACTIVE_KEY}:${this.session.me()?.id ?? 'anon'}`;
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced.set('');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private projectMatchesSearch(project: Project, q: string): boolean {
    const haystack = [
      project.name,
      (project.client?.name ?? 'Personal'),
      project.hourlyRate != null ? String(project.hourlyRate) : '',
      project.isBillable ? 'billable' : 'non-billable',
      project.isActive ? 'active' : 'inactive',
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Project[]>('/projects');
      this.projects.set(
        data.map((project) => ({
          ...project,
          hourlyRate: project.hourlyRate != null ? Number(project.hourlyRate) : undefined,
        })),
      );
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load projects');
    } finally { this.loading.set(false); }
  }

  getRowActions(project: Project): RowActionItem[] {
    return [
      {
        id: 'edit',
        label: 'Edit',
        icon: 'pi pi-pencil',
        command: () => this.router.navigate(['/projects', project.id]),
      },
      {
        id: project.isActive ? 'inactive' : 'active',
        label: project.isActive ? 'Make inactive' : 'Make active',
        icon: project.isActive ? 'pi pi-ban' : 'pi pi-check-circle',
        severity: 'warn',
        command: () => this.toggleActive(project),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(project),
      },
    ];
  }

  async toggleActive(project: Project) {
    const next = !project.isActive;
    try {
      await this.api.put(`/projects/${project.id}`, { isActive: next });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update project');
    }
  }

  confirmDelete(project: Project) {
    this.deleteConfirm.confirm({
      message: `Delete "${project.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/projects/${project.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
