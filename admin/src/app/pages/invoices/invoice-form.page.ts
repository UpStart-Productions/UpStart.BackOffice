import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { ApiService } from '../../core/api.service';
import { AuthStoreService } from '../../core/auth-store.service';

type Client = { id: string; name: string };
type Project = { id: string; name: string; clientId: string };

type LineItem = {
  projectId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

@Component({
  selector: 'app-invoice-form-page',
  standalone: true,
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, TextareaModule, SelectModule, ToggleSwitchModule, TableModule],
  templateUrl: './invoice-form.page.html',
})
export class InvoiceFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthStoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  id = signal<string | null>(null);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);
  clients = signal<Client[]>([]);
  projects = signal<Project[]>([]);
  filteredProjects = signal<Project[]>([]);

  form = {
    clientId: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    taxRate: null as number | null,
  };

  lineItems = signal<LineItem[]>([
    { projectId: '', description: '', quantity: 1, unitPrice: 0, amount: 0 },
  ]);

  get isNew() { return !this.id(); }
  get wsSlug() { return this.auth.workspaceSlug; }
  get subtotal() { return this.lineItems().reduce((s, i) => s + i.amount, 0); }
  get taxAmount() { return this.form.taxRate ? this.subtotal * this.form.taxRate : 0; }
  get total() { return this.subtotal + this.taxAmount; }

  async ngOnInit() {
    const [clients, projects] = await Promise.all([
      this.api.get<Client[]>(`/workspaces/${this.wsSlug}/clients`).catch(() => [] as Client[]),
      this.api.get<Project[]>(`/workspaces/${this.wsSlug}/projects`).catch(() => [] as Project[]),
    ]);
    this.clients.set(clients);
    this.projects.set(projects);

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.id.set(id);
      try {
        const inv = await this.api.get<{ clientId: string; issueDate: string; dueDate?: string; notes?: string; taxRate?: number; lineItems: LineItem[] }>(
          `/workspaces/${this.wsSlug}/invoices/${id}`
        );
        this.form = {
          clientId: inv.clientId,
          issueDate: inv.issueDate.slice(0, 10),
          dueDate: inv.dueDate?.slice(0, 10) ?? '',
          notes: inv.notes ?? '',
          taxRate: inv.taxRate ?? null,
        };
        this.lineItems.set(inv.lineItems.map((li) => ({ ...li, quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), amount: Number(li.amount) })));
        this.onClientChange();
      } catch (err) {
        this.error.set(err instanceof Error ? err.message : 'Failed to load invoice');
      }
    }
    this.loading.set(false);
  }

  onClientChange() {
    this.filteredProjects.set(this.projects().filter((p) => p.clientId === this.form.clientId));
  }

  addLine() {
    this.lineItems.update((items) => [...items, { projectId: '', description: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  }

  removeLine(i: number) {
    this.lineItems.update((items) => items.filter((_, idx) => idx !== i));
  }

  calcLine(item: LineItem) {
    item.amount = Math.round(item.quantity * item.unitPrice * 100) / 100;
  }

  async save() {
    if (!this.form.clientId) { this.error.set('Client is required'); return; }
    if (this.lineItems().length === 0) { this.error.set('At least one line item is required'); return; }
    this.saving.set(true);
    this.error.set(null);
    try {
      const payload = {
        clientId: this.form.clientId,
        issueDate: this.form.issueDate,
        dueDate: this.form.dueDate || undefined,
        notes: this.form.notes || undefined,
        taxRate: this.form.taxRate || undefined,
        lineItems: this.lineItems().map((li, i) => ({
          projectId: li.projectId || undefined,
          description: li.description,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          sortOrder: i,
        })),
      };
      if (this.isNew) await this.api.post(`/workspaces/${this.wsSlug}/invoices`, payload);
      else await this.api.put(`/workspaces/${this.wsSlug}/invoices/${this.id()}`, { notes: this.form.notes, dueDate: this.form.dueDate, taxRate: this.form.taxRate });
      this.router.navigate(['/invoices']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally { this.saving.set(false); }
  }

  formatCurrency(n: number): string {
    return '$' + n.toFixed(2);
  }
}
