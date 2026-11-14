import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { formatCurrency } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { sortInvoicesForAttention } from '../../pages/invoices/invoice-status.util';
import { InvoiceCardComponent, type InvoiceCardData } from '../record-card';

/** Right-hand Invoices panel for an account (clientId) or a project (projectId): compact invoice cards. */
@Component({
  selector: 'app-invoices-panel',
  standalone: true,
  imports: [InvoiceCardComponent, RouterLink, ButtonModule],
  template: `
    <div class="card card--side">
      <div class="card-header">
        <h3 class="card-title">Invoices</h3>
        <div class="invoices-panel-head-right">
          @if (invoices().length) {
            <span class="invoices-panel-total" [title]="'Total of ' + invoices().length + ' invoice' + (invoices().length === 1 ? '' : 's') + ' (void not counted)'">{{ totalLabel() }}</span>
          }
          <a
            pButton
            label="New"
            icon="pi pi-plus"
            size="small"
            severity="secondary"
            routerLink="/invoices/new"
            [queryParams]="newQuery()"
          ></a>
        </div>
      </div>
      <div class="side-panel-scroll">
        @if (loading() && invoices().length === 0) {
          <p class="text-color-secondary m-0">Loading invoices…</p>
        } @else if (error()) {
          <p class="text-color-secondary m-0">{{ error() }}</p>
        }
        @for (inv of invoices(); track inv.id) {
          <app-invoice-card [invoice]="inv" />
        } @empty {
          @if (!loading() && !error()) {
            <p class="text-color-secondary m-0">No invoices yet.</p>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .invoices-panel-head-right { display: flex; align-items: center; gap: 0.75rem; margin-left: auto; }
    .invoices-panel-total { font-size: var(--fs-base); font-weight: 600; white-space: nowrap; }
  `,
})
export class InvoicesPanelComponent {
  private readonly api = inject(ApiService);

  clientId = input<string | null>(null);
  projectId = input<string | null>(null);

  invoices = signal<InvoiceCardData[]>([]);
  /** Sum of the invoices shown, void ones left out. */
  readonly totalLabel = computed(() =>
    formatCurrency(this.invoices().filter((i) => i.status !== 'VOID').reduce((sum, i) => sum + Number(i.total ?? 0), 0)),
  );
  readonly newQuery = computed(() =>
    this.projectId() ? { projectId: this.projectId() } : this.clientId() ? { clientId: this.clientId() } : {},
  );
  loading = signal(false);
  error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const clientId = this.clientId();
      const projectId = this.projectId();
      untracked(() => void this.load(clientId, projectId));
    });
  }

  private async load(clientId: string | null, projectId: string | null) {
    if (!clientId && !projectId) {
      this.invoices.set([]);
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const q = new URLSearchParams();
    if (projectId) q.set('projectId', projectId);
    else if (clientId) q.set('clientId', clientId);
    try {
      type Row = InvoiceCardData & { clientId?: string | null; lineItems?: { projectId?: string | null }[]; number?: number };
      const rows = await this.api.get<Row[]>(`/invoices?${q}`);
      // Filter here too, so the panel only ever shows this record's invoices (even against an API without the filter).
      const mine = rows.filter((r) =>
        projectId ? (r.lineItems ?? []).some((l) => l.projectId === projectId) : r.clientId === clientId,
      );
      // Unpaid and overdue first, the same order as the Invoices list's attention sort.
      this.invoices.set(sortInvoicesForAttention(mine as never) as InvoiceCardData[]);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load invoices');
    } finally {
      this.loading.set(false);
    }
  }
}
