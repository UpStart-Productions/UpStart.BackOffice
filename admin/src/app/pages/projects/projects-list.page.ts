import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';

type Project = { id: string; name: string; isBillable: boolean; isActive: boolean; hourlyRate?: number; client: { id: string; name: string } };

@Component({
  selector: 'app-projects-list-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    TableModule,
    MessageModule,
    TagModule,
    PageComponent,
    RowActionsMenuComponent,
  ],
  templateUrl: './projects-list.page.html',
})
export class ProjectsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredProjects = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    const list = this.projects();
    if (!q) return list;
    return list.filter((project) => this.projectMatchesSearch(project, q));
  });

  readonly emptyMessage = computed(() => {
    if (this.searchDebounced().trim() && this.filteredProjects().length === 0 && this.projects().length > 0) {
      return 'No projects match your search.';
    }
    return 'No projects yet.';
  });

  async ngOnInit() { await this.load(); }

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
      project.client.name,
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
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(project),
      },
    ];
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
