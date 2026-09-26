import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { InputNumberModule } from 'primeng/inputnumber';
import { AccordionModule } from 'primeng/accordion';
import { MessageService } from 'primeng/api';
import { QuillModule } from 'ngx-quill';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { richTextOrUndefined } from '../../core/rich-text.util';
import { PageComponent } from '../../ui/layout/page.component';
import { ArtifactsPanelComponent } from '../../ui/artifacts/artifacts-panel.component';
import {
  ProjectTaskDraft,
  SUGGESTED_PROJECT_TASKS,
} from '../time-entry/time-entry.types';

type Client = { id: string; name: string };
type AsanaResource = { gid: string; name: string };
type AsanaStatus = { configured: boolean; connected: boolean };

type ProjectContactDraft = {
  id?: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  sortOrder: number;
};

type ProjectResponse = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  asanaProjectGid?: string | null;
  asanaProjectGids?: string[] | null;
  asanaProjectName?: string | null;
  asanaSectionGid?: string | null;
  asanaSectionGids?: string[] | null;
  asanaSectionName?: string | null;
  contacts?: ProjectContactDraft[];
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
    ToggleSwitchModule,
    SelectModule,
    MultiSelectModule,
    InputNumberModule,
    AccordionModule,
    QuillModule,
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
  contactRows = signal<ProjectContactDraft[]>([]);
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
    sectionGids: [] as string[],
  };

  readonly asanaConnected = computed(() => this.asanaStatus()?.connected === true);
  readonly asanaLinked = computed(
    () => !!this.asanaLink.projectGid && this.asanaLink.sectionGids.length > 0,
  );
  readonly manualTaskCount = computed(() => this.manualTasks().length);
  readonly contactCount = computed(() => this.contactRows().length);
  readonly asanaTaskCount = computed(() => this.asanaTasks().length);

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

  contactSummary(): string {
    const names = this.contactRows()
      .map((contact) => [contact.firstName, contact.lastName].map((part) => part.trim()).filter(Boolean).join(' '))
      .filter(Boolean);
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    return `${names[0]} +${names.length - 1}`;
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
      hourlyRate: project.hourlyRate ?? null,
      isBillable: project.isBillable,
      isActive: project.isActive,
    };
    this.contactRows.set(this.mapContacts(project.contacts ?? []));
    const sectionGids = this.parseStoredSectionGids(project);
    this.asanaLink = {
      projectGid: project.asanaProjectGid ?? null,
      sectionGids,
    };
    if (project.asanaProjectGid) {
      this.ensureAsanaProjectOption(project.asanaProjectGid, project.asanaProjectName);
      await this.loadAsanaSections(project.asanaProjectGid);
      this.ensureAsanaSectionOptions(sectionGids, project.asanaSectionName);
    }
    this.splitTasks(project.tasks ?? [], project.isBillable);
  }

  private splitTasks(tasks: ProjectTaskDraft[], projectBillable = this.form.isBillable) {
    const manual = tasks.filter((t) => t.source !== 'ASANA');
    const asana = tasks.filter((t) => t.source === 'ASANA' && t.isActive);
    const taskBillable = (value: boolean) => (projectBillable ? value : false);
    this.manualTasks.set(
      manual.length > 0
        ? manual.map((t, i) => ({
            id: t.id,
            name: t.name,
            source: t.source,
            isBillable: taskBillable(t.isBillable),
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
        isBillable: taskBillable(t.isBillable),
        sortOrder: t.sortOrder ?? i,
        isActive: t.isActive ?? true,
      })),
    );
  }

  private defaultTasks(): ProjectTaskDraft[] {
    return SUGGESTED_PROJECT_TASKS.map((t, i) => ({
      name: t.name,
      isBillable: this.form.isBillable ? t.isBillable : false,
      sortOrder: i,
      isActive: true,
      source: 'MANUAL' as const,
    }));
  }

  onProjectBillableChange(isBillable: boolean) {
    this.form.isBillable = isBillable;
    if (!isBillable) {
      this.manualTasks.update((tasks) =>
        tasks.map((t) => ({ ...t, isBillable: false })),
      );
      this.asanaTasks.update((tasks) =>
        tasks.map((t) => ({ ...t, isBillable: false })),
      );
    }
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

  private parseStoredSectionGids(project: ProjectResponse): string[] {
    if (Array.isArray(project.asanaSectionGids) && project.asanaSectionGids.length > 0) {
      return project.asanaSectionGids.filter(Boolean);
    }
    return project.asanaSectionGid ? [project.asanaSectionGid] : [];
  }

  private ensureAsanaProjectOption(gid: string, name?: string | null) {
    if (this.asanaProjects().some((p) => p.gid === gid)) return;
    this.asanaProjects.update((list) => [...list, { gid, name: name ?? 'Linked board' }]);
  }

  private ensureAsanaSectionOptions(gids: string[], name?: string | null) {
    const names = (name ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    gids.forEach((gid, index) => {
      if (this.asanaSections().some((s) => s.gid === gid)) return;
      this.asanaSections.update((list) => [
        ...list,
        { gid, name: names[index] ?? names[0] ?? 'Linked section' },
      ]);
    });
  }

  async onAsanaProjectChange(projectGid: string | null) {
    this.asanaLink.projectGid = projectGid;
    this.asanaLink.sectionGids = [];
    this.asanaSections.set([]);
    this.asanaSectionsError.set(null);
    this.asanaSectionValidationError.set(null);
    if (projectGid) {
      await this.loadAsanaSections(projectGid);
    }
  }

  onAsanaSectionsChange(sectionGids: string[] | null) {
    this.asanaLink.sectionGids = sectionGids ?? [];
    if (this.asanaLink.sectionGids.length > 0) {
      this.asanaSectionValidationError.set(null);
    }
  }

  private openAccordionPanel(panel: string) {
    if (!this.accordionOpenPanels.includes(panel)) {
      this.accordionOpenPanels = [...this.accordionOpenPanels, panel];
    }
  }

  private mapContacts(contacts: ProjectContactDraft[]): ProjectContactDraft[] {
    return contacts.map((contact, index) => ({
      id: contact.id,
      firstName: contact.firstName ?? '',
      lastName: contact.lastName ?? '',
      phone: contact.phone ?? '',
      email: contact.email ?? '',
      sortOrder: contact.sortOrder ?? index,
    }));
  }

  addContact() {
    this.contactRows.update((rows) => [
      ...rows,
      {
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        sortOrder: rows.length,
      },
    ]);
  }

  contactDisplayName(contact: Pick<ProjectContactDraft, 'firstName' | 'lastName'>): string {
    return [contact.firstName, contact.lastName]
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' ');
  }

  confirmRemoveContact(index: number) {
    const contact = this.contactRows()[index];
    const label = this.contactDisplayName(contact) || 'this contact';
    this.deleteConfirm.confirm({
      message: `Remove contact "${label}"?`,
      accept: () => {
        this.contactRows.update((rows) => rows.filter((_, i) => i !== index));
      },
    });
  }

  private contactPayload() {
    const trim = (value: string) => value.trim() || undefined;
    return this.contactRows()
      .map((contact, index) => ({
        id: contact.id,
        firstName: trim(contact.firstName),
        lastName: trim(contact.lastName),
        phone: trim(contact.phone),
        email: trim(contact.email),
        sortOrder: index,
      }))
      .filter(
        (contact) =>
          contact.firstName || contact.lastName || contact.phone || contact.email,
      );
  }

  addTask() {
    this.manualTasks.update((list) => [
      ...list,
      {
        name: '',
        isBillable: this.form.isBillable,
        sortOrder: list.length,
        isActive: true,
        source: 'MANUAL',
      },
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
        this.asanaLink.sectionGids = [];
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
    const names = this.asanaLink.sectionGids
      .map((gid) => this.asanaSections().find((s) => s.gid === gid)?.name)
      .filter((name): name is string => !!name);
    return names.join(', ');
  }

  private asanaLinkPayload() {
    const projectGid = this.asanaLink.projectGid;
    const sectionGids = this.asanaLink.sectionGids;
    if (!projectGid && sectionGids.length === 0) {
      return {
        asanaProjectGid: null,
        asanaProjectGids: [],
        asanaProjectName: null,
        asanaSectionGid: null,
        asanaSectionGids: [],
        asanaSectionName: null,
      };
    }
    const project = this.asanaProjects().find((p) => p.gid === projectGid);
    const sectionNames = sectionGids
      .map((gid) => this.asanaSections().find((s) => s.gid === gid)?.name)
      .filter((name): name is string => !!name);
    return {
      asanaProjectGid: projectGid,
      asanaProjectGids: projectGid ? [projectGid] : [],
      asanaProjectName: project?.name ?? null,
      asanaSectionGid: sectionGids[0] ?? null,
      asanaSectionGids: sectionGids,
      asanaSectionName: sectionNames.join(', ') || null,
    };
  }

  async refreshFromAsana() {
    const projectId = this.id();
    if (!projectId) return;
    if (!this.asanaLink.projectGid || this.asanaLink.sectionGids.length === 0) {
      this.error.set('Select an Asana board and at least one section first');
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
    return {
      clientId: this.form.clientId,
      name: this.form.name,
      description: richTextOrUndefined(this.form.description),
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

    if (this.asanaLink.projectGid && this.asanaLink.sectionGids.length === 0) {
      this.asanaSectionValidationError.set('Select at least one Asana section when a board is linked');
      this.openAccordionPanel('asana');
      return;
    }
    this.asanaSectionValidationError.set(null);

    const taskDrafts = this.manualTasks()
      .map((t) => ({ ...t, name: t.name.trim() }))
      .filter((t) => t.name)
      .map((t) => ({
        ...t,
        isBillable: this.form.isBillable ? t.isBillable : false,
      }));

    const duplicateNames = taskDrafts.some(
      (t, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase()) !== i,
    );
    if (duplicateNames) {
      this.error.set('Manual task names must be unique');
      return;
    }

    const duplicateEmails = this.contactPayload().some(
      (contact, index, arr) =>
        contact.email &&
        arr.findIndex(
          (other) => other.email?.toLowerCase() === contact.email?.toLowerCase(),
        ) !== index,
    );
    if (duplicateEmails) {
      this.error.set('Contact emails must be unique');
      this.openAccordionPanel('contact');
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
        if (asanaPayload.asanaSectionGids.length > 0) {
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

      await this.api.put(`/projects/${projectId}/contacts`, {
        contacts: this.contactPayload(),
      });

      if (this.asanaTasks().length > 0) {
        await this.api.patch(`/projects/${projectId}/asana-tasks`, {
          tasks: this.asanaTasks().map((t) => ({
            id: t.id!,
            isBillable: this.form.isBillable ? t.isBillable : false,
          })),
        });
      }

      const refreshed = await this.api.get<ProjectResponse>(`/projects/${projectId}`);
      this.splitTasks(refreshed.tasks ?? []);
      this.contactRows.set(this.mapContacts(refreshed.contacts ?? []));

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
