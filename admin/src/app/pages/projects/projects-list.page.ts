import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';

type Project = { id: string; name: string; isBillable: boolean; isActive: boolean; hourlyRate?: number; client: { id: string; name: string } };

@Component({
  selector: 'app-projects-list-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, TableModule, MessageModule, ConfirmDialogModule, TagModule, PageComponent],
  providers: [ConfirmationService],
  templateUrl: './projects-list.page.html',
})
export class ProjectsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(ConfirmationService);

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

  confirmDelete(project: Project) {
    this.confirm.confirm({
      message: `Delete "${project.name}"?`,
      accept: async () => {
        try {
          await this.api.delete(`/projects/${project.id}`);
          await this.load();
        } catch (err) { this.error.set(err instanceof Error ? err.message : 'Delete failed'); }
      },
    });
  }
}
