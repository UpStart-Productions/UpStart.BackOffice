import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';
import { PageComponent } from '../../ui/layout/page.component';

@Component({
  selector: 'app-client-form-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TextareaModule,
    ToggleSwitchModule,
    PageComponent,
  ],
  templateUrl: './client-form.page.html',
})
export class ClientFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  form = { name: '', code: '', email: '', phone: '', address: '', city: '', state: '', zip: '', website: '', notes: '', isActive: true };

  get isNew() { return !this.id(); }
  get wsSlug() { return this.auth.workspaceSlug; }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const client = await this.api.get<typeof this.form & { id: string }>(`/workspaces/${this.wsSlug}/clients/${id}`);
        this.form = { ...client };
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load client');
      }
    }
    this.loading.set(false);
  }

  async save() {
    if (!this.form.name || !this.form.code) { this.error.set('Name and Code are required'); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      if (this.isNew) {
        await this.api.post(`/workspaces/${this.wsSlug}/clients`, this.form);
      } else {
        await this.api.put(`/workspaces/${this.wsSlug}/clients/${this.id()}`, this.form);
      }
      this.router.navigate(['/clients']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally { this.saving.set(false); }
  }
}
