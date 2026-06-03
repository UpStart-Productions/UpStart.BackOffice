import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  form = { name: '', code: '', email: '', phone: '', address: '', city: '', state: '', zip: '', website: '', notes: '', isActive: true };

  get isNew() { return !this.id(); }

  private patchForm(client: Partial<typeof this.form>) {
    this.form = {
      name: client.name ?? '',
      code: client.code ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      city: client.city ?? '',
      state: client.state ?? '',
      zip: client.zip ?? '',
      website: client.website ?? '',
      notes: client.notes ?? '',
      isActive: client.isActive ?? true,
    };
  }

  private buildPayload() {
    const emptyToUndefined = (v: string) => (v.trim() ? v.trim() : undefined);
    return {
      name: this.form.name.trim(),
      code: this.form.code.trim(),
      email: emptyToUndefined(this.form.email),
      phone: emptyToUndefined(this.form.phone),
      address: emptyToUndefined(this.form.address),
      city: emptyToUndefined(this.form.city),
      state: emptyToUndefined(this.form.state),
      zip: emptyToUndefined(this.form.zip),
      website: emptyToUndefined(this.form.website),
      notes: emptyToUndefined(this.form.notes),
      isActive: this.form.isActive,
    };
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const client = await this.api.get<typeof this.form & { id: string }>(`/clients/${id}`);
        this.patchForm(client);
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
      const payload = this.buildPayload();
      if (this.isNew) {
        await this.api.post('/clients', payload);
      } else {
        await this.api.put(`/clients/${this.id()}`, payload);
      }
      this.router.navigate(['/clients']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally { this.saving.set(false); }
  }
}
