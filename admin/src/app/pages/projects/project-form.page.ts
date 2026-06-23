import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { AccordionModule } from 'primeng/accordion';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import {
  ProjectTaskDraft,
  SUGGESTED_PROJECT_TASKS,
} from '../time-entry/time-entry.types';

type Client = { id: string; name: string };
type AsanaResource = { gid: string; name: string };
type AsanaStatus = { configured: boolean; connected: boolean };

type ProjectResponse = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  asanaProjectGid?: string | null;
  asanaProjectName?: string | null;
  asanaSectionGid?: string | null;
  asanaSectionName?: string | null;
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
    TagModule,
    TextareaModule,
    ToggleSwitchModule,
    SelectModule,
    InputNumberModule,
    AccordionModule,
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
  private readonly toast = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  syncingAsana = signal(false);
  error = signal<string | null>(null);
  clients = signal<Client[]>([]);
  manualTasks = signal<ProjectTaskDraft[]>([]);
  asanaTasks = signal<ProjectTaskDraft[]>([]);

  asanaStatus = signal<AsanaStatus | null>(null);
  asanaProjects = signal<AsanaResource[]>([]);
  asanaSections = signal<AsanaResource[]>([]);
  loadingAsanaProjects = signal(false);
  loadingAsanaSections = signal(false);
  asanaSectionsError = signal<string | null>(null);
  asanaSectionValidationError = signal<string | null>(null);
  accordionOpenPanels: string[] = [];

  asanaLink = {
    projectGid: null as string | null,
    sectionGid: null as string | null,
  };

  readonly asanaConnected = computed(() => this.asanaStatus()?.connected === true);
  readonly asanaLinked = computed(
    () => !!(this.asanaLink.projectGid && this.asanaLink.sectionGid),
  );
  readonly manualTaskCount = computed(() => this.manualTasks().length);
  readonly asanaTaskCount = computed(() => this.asanaTasks().length);

  form = {
    clientId: '',
    name: '',
    description: '',
    contactFirstName: '',
    contactLastName: '',
    contactPhone: '',
    contactEmail: '',
    hourlyRate: null as number | null,
    isBillable: true,
    isActive: true,
  };

  get isNew() {
    return !this.id();
  }

  contactDisplayName(): string {
    return [this.form.contactFirstName, this.form.contactLastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ');
  }

  async ngOnInit() {
    const [clientsData, asanaStatus] = await Promise.all([
      this.api.get<Client[]>('/clients').catch(() => [] as Client[]),
      this.api.get<AsanaStatus>('/asana/status').catch(() => null),
    ]);
    this.clients.set(clientsData);
    this.asanaStatus.set(asanaStatus);

    if (asanaStatus?.connected) {
      await this.loadAsanaProjects();
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        await this.applyProject(await this.api.get<ProjectResponse>(`/projects/${id}`));
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load project');
      }
    } else {
      this.manualTasks.set(this.defaultTasks());
      const clientId = this.route.snapshot.queryParamMap.get('clientId');
      if (clientId) this.form.clientId = clientId;
    }
    this.loading.set(false);
  }

  private async applyProject(project: ProjectResponse) {
    this.form = {
      clientId: project.clientId,
      name: project.name,
      description: project.description ?? '',
      contactFirstName: project.contactFirstName ?? '',
      contactLastName: project.contactLastName ?? '',
      contactPhone: project.contactPhone ?? '',
      contactEmail: project.contactEmail ?? '',
      hourlyRate: project.hourlyRate ?? null,
      isBillable: project.isBillable,
      isActive: project.isActive,
    };
    this.asanaLink = {
      projectGid: project.asanaProjectGid ?? null,
      sectionGid: project.asanaSectionGid ?? null,
    };
    if (project.asanaProjectGid) {
      this.ensureAsanaProjectOption(project.asanaProjectGid, project.asanaProjectName);
      await this.loadAsanaSections(project.asanaProjectGid);
      if (project.asanaSectionGid) {
        this.ensureAsanaSectionOption(project.asanaSectionGid, project.asanaSectionName);
      }
    }
    this.splitTasks(project.tasks ?? []);
  }

  private splitTasks(tasks: ProjectTaskDraft[]) {
    const manual = tasks.filter((t) => t.source !== 'ASANA');
    const asana = tasks.filter((t) => t.source === 'ASANA' && t.isActive);
    this.manualTasks.set(
      manual.length > 0
        ? manual.map((t, i) => ({
            id: t.id,
            name: t.name,
            source: t.source,
            isBillable: t.isBillable,
            sortOrder: t.sortOrder ?? i,
            isActive: t.isActive ?? true,
          }))
        : this.defaultTasks(),
    );
    this.asanaTasks.set(
      asana.map((t, i) => ({
        id: t.id,
        name: t.name,
        source: 'ASANA' as const,
        isBillable: t.isBillable,
        sortOrder: t.sortOrder ?? i,
        isActive: t.isActive ?? true,
      })),
    );
  }

  private defaultTasks(): ProjectTaskDraft[] {
    return SUGGESTED_PROJECT_TASKS.map((t, i) => ({
      name: t.name,
      isBillable: t.isBillable,
      sortOrder: i,
      isActive: true,
      source: 'MANUAL' as const,
    }));
  }

  async loadAsanaProjects() {
    this.loadingAsanaProjects.set(true);
    try {
      this.asanaProjects.set(await this.api.get<AsanaResource[]>('/asana/projects'));
    } catch {
      this.asanaProjects.set([]);
    } finally {
      this.loadingAsanaProjects.set(false);
    }
  }

  async onAsanaProjectSelectOpen() {
    if (!this.asanaConnected()) return;
    await this.loadAsanaProjects();
  }

  async onAsanaSectionSelectOpen() {
    const projectGid = this.asanaLink.projectGid;
    if (!projectGid || !this.asanaConnected()) return;
    await this.loadAsanaSections(projectGid);
  }

  async loadAsanaSections(projectGid: string) {
    this.loadingAsanaSections.set(true);
    this.asanaSectionsError.set(null);
    try {
      const sections = await this.api.get<AsanaResource[]>(
        `/asana/projects/${projectGid}/sections`,
      );
      this.asanaSections.set(sections);
      if (sections.length === 0) {
        this.asanaSectionsError.set(
          'No sections found for this board. Board columns appear as sections — add at least one task to a column if the list is empty.',
        );
      }
    } catch (err) {
      this.asanaSections.set([]);
      this.asanaSectionsError.set(
        err instanceof Error ? err.message : 'Failed to load Asana sections',
      );
    } finally {
      this.loadingAsanaSections.set(false);
    }
  }

  private ensureAsanaProjectOption(gid: string, name?: string | null) {
    if (this.asanaProjects().some((p) => p.gid === gid)) return;
    this.asanaProjects.update((list) => [...list, { gid, name: name ?? 'Linked board' }]);
  }

  private ensureAsanaSectionOption(gid: string, name?: string | null) {
    if (this.asanaSections().some((s) => s.gid === gid)) return;
    this.asanaSections.update((list) => [...list, { gid, name: name ?? 'Linked section' }]);
  }

  async onAsanaProjectChange(projectGid: string | null) {
    this.asanaLink.projectGid = projectGid;
    this.asanaLink.sectionGid = null;
    this.asanaSections.set([]);
    this.asanaSectionsError.set(null);
    this.asanaSectionValidationError.set(null);
    if (projectGid) {
      await this.loadAsanaSections(projectGid);
    }
  }

  onAsanaSectionChange(sectionGid: string | null) {
    this.asanaLink.sectionGid = sectionGid;
    if (sectionGid) {
      this.asanaSectionValidationError.set(null);
    }
  }

  private openAccordionPanel(panel: string) {
    if (!this.accordionOpenPanels.includes(panel)) {
      this.accordionOpenPanels = [...this.accordionOpenPanels, panel];
    }
  }

  addTask() {
    this.manualTasks.update((list) => [
      ...list,
      { name: '', isBillable: true, sortOrder: list.length, isActive: true, source: 'MANUAL' },
    ]);
  }

  removeTask(index: number) {
    this.manualTasks.update((list) => list.filter((_, i) => i !== index));
  }

  confirmUnlinkAsana() {
    this.deleteConfirm.confirm({
      header: 'Unlink Asana',
      message: 'Remove the Asana board link from this project? Synced Asana tasks will be hidden from timesheets.',
      accept: () => {
        this.asanaLink.projectGid = null;
        this.asanaLink.sectionGid = null;
        this.asanaSections.set([]);
        this.asanaTasks.set([]);
      },
    });
  }

  asanaProjectLabel(): string {
    const gid = this.asanaLink.projectGid;
    if (!gid) return '';
    return this.asanaProjects().find((p) => p.gid === gid)?.name ?? this.form.name;
  }

  asanaSectionLabel(): string {
    const gid = this.asanaLink.sectionGid;
    if (!gid) return '';
    return this.asanaSections().find((s) => s.gid === gid)?.name ?? '';
  }

  private asanaLinkPayload() {
    const projectGid = this.asanaLink.projectGid;
    const sectionGid = this.asanaLink.sectionGid;
    if (!projectGid && !sectionGid) {
      return {
        asanaProjectGid: null,
        asanaProjectName: null,
        asanaSectionGid: null,
        asanaSectionName: null,
      };
    }
    const project = this.asanaProjects().find((p) => p.gid === projectGid);
    const section = this.asanaSections().find((s) => s.gid === sectionGid);
    return {
      asanaProjectGid: projectGid,
      asanaProjectName: project?.name ?? null,
      asanaSectionGid: sectionGid,
      asanaSectionName: section?.name ?? null,
    };
  }

  async refreshFromAsana() {
    const projectId = this.id();
    if (!projectId) return;
    if (!this.asanaLink.projectGid || !this.asanaLink.sectionGid) {
      this.error.set('Select an Asana board and section first');
      return;
    }

    this.syncingAsana.set(true);
    this.error.set(null);
    try {
      await this.api.put(`/projects/${projectId}`, {
        ...this.projectPayload(),
        ...this.asanaLinkPayload(),
      });
      await this.syncAsanaTasks(projectId);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Asana sync failed');
    } finally {
      this.syncingAsana.set(false);
    }
  }

  private async syncAsanaTasks(projectId: string, options?: { silent?: boolean }) {
    const project = await this.api.post<ProjectResponse>(`/projects/${projectId}/asana/sync`);
    this.splitTasks(project.tasks ?? []);
    if (!options?.silent) {
      this.toast.add({
        severity: 'success',
        summary: 'Synced',
        detail: 'Tasks refreshed from Asana.',
      });
    }
  }

  private projectPayload() {
    const trim = (v: string) => v.trim() || undefined;
    return {
      clientId: this.form.clientId,
      name: this.form.name,
      description: trim(this.form.description),
      contactFirstName: trim(this.form.contactFirstName),
      contactLastName: trim(this.form.contactLastName),
      contactPhone: trim(this.form.contactPhone),
      contactEmail: trim(this.form.contactEmail),
      hourlyRate: this.form.hourlyRate,
      isBillable: this.form.isBillable,
      isActive: this.form.isActive,
    };
  }

  async save() {
    if (!this.form.clientId || !this.form.name) {
      this.error.set('Client and Name are required');
      return;
    }

    if (this.asanaLink.projectGid && !this.asanaLink.sectionGid) {
      this.asanaSectionValidationError.set('Select an Asana section when a board is linked');
      this.openAccordionPanel('asana');
      return;
    }
    this.asanaSectionValidationError.set(null);

    const taskDrafts = this.manualTasks()
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name);

    const duplicateNames = taskDrafts.some(
      (t, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) !== i,
    );
    if (duplicateNames) {
      this.error.set('Manual task names must be unique');
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      let projectId = this.id();
      const asanaPayload = this.asanaLinkPayload();

      if (this.isNew) {
        const created = await this.api.post<ProjectResponse>('/projects', this.projectPayload());
        projectId = created.id;
        if (asanaPayload.asanaSectionGid) {
          await this.api.put(`/projects/${projectId}`, {
            ...this.projectPayload(),
            ...asanaPayload,
          });
        }
      } else {
        await this.api.put(`/projects/${projectId}`, {
          ...this.projectPayload(),
          ...asanaPayload,
        });
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

      if (this.asanaTasks().length > 0) {
        await this.api.patch(`/projects/${projectId}/asana-tasks`, {
          tasks: this.asanaTasks().map((t) => ({
            id: t.id!,
            isBillable: t.isBillable,
          })),
        });
      }

      const refreshed = await this.api.get<ProjectResponse>(`/projects/${projectId}`);
      this.splitTasks(refreshed.tasks ?? []);

      if (this.isNew) {
        this.id.set(projectId);
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Project created successfully.',
        });
        await this.router.navigate(['/projects', projectId], { replaceUrl: true });
      } else {
        this.toast.add({
          severity: 'success',
          summary: 'Saved',
          detail: 'Project saved successfully.',
        });
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
