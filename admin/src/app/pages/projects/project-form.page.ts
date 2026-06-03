import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';

type Client = { id: string; name: string };

@Component({
  selector: 'app-project-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    ToggleSwitchModule,
    SelectModule,
    PageComponent,
  ],
  templateUrl: './project-form.page.html',
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

  form = { clientId: '', name: '', description: '', hourlyRate: null as number | null, isBillable: true, isActive: true };

  get isNew() { return !this.id(); }

  async ngOnInit() {
    const [clientsData] = await Promise.all([
      this.api.get<Client[]>('/clients').catch(() => [] as Client[]),
    ]);
    this.clients.set(clientsData);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const project = await this.api.get<typeof this.form & { id: string }>(`/projects/${id}`);
        this.form = { clientId: project.clientId, name: project.name, description: project.description ?? '', hourlyRate: project.hourlyRate, isBillable: project.isBillable, isActive: project.isActive };
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load project');
      }
    }
    this.loading.set(false);
  }

  async save() {
    if (!this.form.clientId || !this.form.name) { this.error.set('Client and Name are required'); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.isNew) await this.api.post('/projects', this.form);
      else await this.api.put(`/projects/${this.id()}`, this.form);
      this.router.navigate(['/projects']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally { this.saving.set(false); }
  }
}
