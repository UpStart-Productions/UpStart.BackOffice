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

type Client = { id: string; name: string; code: string; email?: string; phone?: string; isActive: boolean };

@Component({
  selector: 'app-clients-list-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, TableModule, MessageModule, ConfirmDialogModule, TagModule, PageComponent],
  providers: [ConfirmationService],
  templateUrl: './clients-list.page.html',
})
export class ClientsListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly confirm = inject(ConfirmationService);

  clients = signal<Client[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Client[]>('/clients');
      this.clients.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load clients');
    } finally { this.loading.set(false); }
  }

  confirmDelete(client: Client) {
    this.confirm.confirm({
      message: `Delete "${client.name}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/clients/${client.id}`);
          await this.load();
        } catch (err) { this.error.set(err instanceof Error ? err.message : 'Delete failed'); }
      },
    });
  }
}
