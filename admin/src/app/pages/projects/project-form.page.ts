import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import {
  ProjectTaskDraft,
  SUGGESTED_PROJECT_TASKS,
} from '../time-entry/time-entry.types';

type Client = { id: string; name: string };

type ProjectResponse = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  tasks?: ProjectTaskDraft[];
};

@Component({
  selector: 'app-project-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TextareaModule,
    ToggleSwitchModule,
    SelectModule,
    PageComponent,
    ArtifactsPanelComponent,
  ],
  templateUrl: './project-form.page.html',
  styleUrl: './project-form.page.scss',
})
export class ProjectFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  clients = signal<Client[]>([]);
  tasks = signal<ProjectTaskDraft[]>([]);

  form = {
    clientId: '',
    name: '',
    description: '',
    hourlyRate: null as number | null,
    isBillable: true,
    isActive: true,
  };

  get isNew() {
    return !this.id();
  }

  async ngOnInit() {
    const [clientsData] = await Promise.all([
      this.api.get<Client[]>('/clients').catch(() => [] as Client[]),
    ]);
    this.clients.set(clientsData);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const project = await this.api.get<ProjectResponse>(`/projects/${id}`);
        this.form = {
          clientId: project.clientId,
          name: project.name,
          description: project.description ?? '',
          hourlyRate: project.hourlyRate ?? null,
          isBillable: project.isBillable,
          isActive: project.isActive,
        };
        this.tasks.set(
          (project.tasks ?? []).length > 0
            ? (project.tasks ?? []).map((t, i) => ({
                id: t.id,
                name: t.name,
                isBillable: t.isBillable,
                sortOrder: t.sortOrder ?? i,
                isActive: t.isActive ?? true,
              }))
            : this.defaultTasks(),
        );
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load project');
      }
    } else {
      this.tasks.set(this.defaultTasks());
    }
    this.loading.set(false);
  }

  private defaultTasks(): ProjectTaskDraft[] {
    return SUGGESTED_PROJECT_TASKS.map((t, i) => ({
      name: t.name,
      isBillable: t.isBillable,
      sortOrder: i,
      isActive: true,
    }));
  }

  addTask() {
    this.tasks.update((list) => [
      ...list,
      { name: '', isBillable: true, sortOrder: list.length, isActive: true },
    ]);
  }

  removeTask(index: number) {
    this.tasks.update((list) => list.filter((_, i) => i !== index));
  }

  async save() {
    if (!this.form.clientId || !this.form.name) {
      this.error.set('Client and Name are required');
      return;
    }

    const taskDrafts = this.tasks()
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name);

    const duplicateNames = taskDrafts.some(
      (t, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) !== i,
    );
    if (duplicateNames) {
      this.error.set('Task names must be unique');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      let projectId = this.id();
      if (this.isNew) {
        const created = await this.api.post<ProjectResponse>('/projects', this.form);
        projectId = created.id;
      } else {
        await this.api.put(`/projects/${projectId}`, this.form);
      }

      await this.api.put(`/projects/${projectId}/tasks`, {
        tasks: taskDrafts.map((t, i) => ({
          id: t.id,
          name: t.name,
          isBillable: t.isBillable,
          sortOrder: i,
          isActive: t.isActive,
        })),
      });

      this.router.navigate(['/projects']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
