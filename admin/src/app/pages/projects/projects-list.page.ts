import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
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
  imports: [RouterLink, ButtonModule, TableModule, MessageModule, TagModule, PageComponent, RowActionsMenuComponent],
  templateUrl: './projects-list.page.html',
})
export class ProjectsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Project[]>('/projects');
      this.projects.set(data);
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
