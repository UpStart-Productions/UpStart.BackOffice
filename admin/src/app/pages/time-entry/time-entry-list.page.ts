import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';

type Project = { id: string; name: string; client: { id: string; name: string } };
type TimeEntry = {
  id: string; description?: string; startedAt: string; stoppedAt?: string;
  durationMin?: number; isBillable: boolean; hourlyRate?: number;
  project: { id: string; name: string; client: { id: string; name: string } };
};

@Component({
  selector: 'app-time-entry-list-page',
  standalone: true,
  imports: [
    FormsModule, ButtonModule, TableModule, MessageModule, DialogModule,
    InputTextModule, SelectModule, ToggleSwitchModule, ConfirmDialogModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './time-entry-list.page.html',
})
export class TimeEntryListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly confirm = inject(ConfirmationService);

  entries = signal<TimeEntry[]>([]);
  projects = signal<Project[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  dialogVisible = signal(false);
  saving = signal(false);
  runningEntry = signal<TimeEntry | null>(null);

  form = {
    projectId: '',
    description: '',
    startedAt: new Date().toISOString().slice(0, 16),
    stoppedAt: '',
    isBillable: true,
    hourlyRate: null as number | null,
  };

  get wsSlug() { return this.auth.workspaceSlug; }

  async ngOnInit() {
    await Promise.all([this.loadEntries(), this.loadProjects()]);
  }

  async loadEntries() {
    this.loading.set(true);
    try {
      const data = await this.api.get<TimeEntry[]>(`/workspaces/${this.wsSlug}/time-entries`);
      this.entries.set(data);
      this.runningEntry.set(data.find((e) => !e.stoppedAt) ?? null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load entries');
    } finally { this.loading.set(false); }
  }

  async loadProjects() {
    try {
      const data = await this.api.get<Project[]>(`/workspaces/${this.wsSlug}/projects`);
      this.projects.set(data);
    } catch { /* ignore */ }
  }

  openNew() {
    this.form = {
      projectId: '',
      description: '',
      startedAt: new Date().toISOString().slice(0, 16),
      stoppedAt: '',
      isBillable: true,
      hourlyRate: null,
    };
    this.dialogVisible.set(true);
  }

  async save() {
    if (!this.form.projectId) return;
    this.saving.set(true);
    try {
      await this.api.post(`/workspaces/${this.wsSlug}/time-entries`, {
        projectId: this.form.projectId,
        description: this.form.description || undefined,
        startedAt: new Date(this.form.startedAt).toISOString(),
        stoppedAt: this.form.stoppedAt ? new Date(this.form.stoppedAt).toISOString() : undefined,
        isBillable: this.form.isBillable,
        hourlyRate: this.form.hourlyRate || undefined,
      });
      this.dialogVisible.set(false);
      await this.loadEntries();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save');
    } finally { this.saving.set(false); }
  }

  async startTimer(projectId: string) {
    try {
      await this.api.post(`/workspaces/${this.wsSlug}/time-entries`, {
        projectId,
        startedAt: new Date().toISOString(),
        isBillable: true,
      });
      await this.loadEntries();
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'Failed to start timer'); }
  }

  async stopTimer(id: string) {
    try {
      await this.api.post(`/workspaces/${this.wsSlug}/time-entries/${id}/stop`);
      await this.loadEntries();
    } catch (err) { this.error.set(err instanceof Error ? err.message : 'Failed to stop timer'); }
  }

  confirmDelete(entry: TimeEntry) {
    this.confirm.confirm({
      message: 'Delete this time entry?',
      accept: async () => {
        try {
          await this.api.delete(`/workspaces/${this.wsSlug}/time-entries/${entry.id}`);
          await this.loadEntries();
        } catch (err) { this.error.set(err instanceof Error ? err.message : 'Delete failed'); }
      },
    });
  }

  formatDuration(min?: number): string {
    if (!min) return '—';
    const h = Math.floor(min / 60), m = min % 60;
    return `${h}h ${m}m`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
