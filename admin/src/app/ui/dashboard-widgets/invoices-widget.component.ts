import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

type Invoice = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  total: number;
  client: { id: string; name: string };
};

@Component({
  selector: 'app-dashboard-invoices-widget',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule],
  template: `
    @if (loading()) {
      <p class="text-muted mb-0">Loading…</p>
    } @else if (error()) {
      <p class="mb-0" role="alert">{{ error() }}</p>
    } @else if (recentInvoices().length === 0) {
      <p class="text-muted mb-0">No invoices yet.</p>
      <div class="widget-footer">
        <a pButton label="Create invoice" icon="pi pi-plus" routerLink="/invoices/new"></a>
      </div>
    } @else {
      @if (draftCount() > 0) {
        <p class="draft-note">{{ draftCount() }} draft{{ draftCount() === 1 ? '' : 's' }} ready to send</p>
      }

      <ul class="dashboard-list">
        @for (inv of recentInvoices(); track inv.id) {
          <li class="dashboard-list-item">
            <a
              [routerLink]="inv.status === 'DRAFT' ? ['/invoices', inv.id, 'edit'] : ['/invoices', inv.id]"
              class="dashboard-list-link"
            >
              <span class="dashboard-list-title">{{ inv.displayNumber }}</span>
              <span class="text-muted">{{ inv.client.name }}</span>
            </a>
            <div class="dashboard-list-right">
              <span class="dashboard-list-amount">{{ formatAmount(inv.total) }}</span>
              <p-tag [value]="inv.status" [severity]="statusSeverity(inv.status)" />
            </div>
          </li>
        }
      </ul>

      <div class="widget-footer">
        <a pButton label="View all invoices" icon="pi pi-arrow-right" iconPos="right" routerLink="/invoices"></a>
      </div>
    }
  `,
  styles: [
    `
      .draft-note {
        margin: 0 0 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-severity-warning-text);
      }

      .dashboard-list {
        list-style: none;
        margin: 0 0 1rem;
        padding: 0;
      }

      .dashboard-list-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.625rem 0;
        border-bottom: 1px solid var(--color-border);
      }

      .dashboard-list-item:last-child {
        border-bottom: none;
      }

      .dashboard-list-link {
        display: flex;
        flex-direction: column;
        gap: 0.125rem;
        min-width: 0;
        color: inherit;
        text-decoration: none;
      }

      .dashboard-list-link:hover .dashboard-list-title {
        color: var(--brand-primary);
      }

      .dashboard-list-title {
        font-weight: 600;
        font-size: 0.875rem;
      }

      .dashboard-list-right {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.25rem;
        flex-shrink: 0;
      }

      .dashboard-list-amount {
        font-weight: 600;
        font-variant-numeric: tabular-nums;
        font-size: 0.875rem;
      }

      .widget-footer {
        margin-top: auto;
        padding-top: 0.5rem;
      }
    `,
  ],
})
export class DashboardInvoicesWidgetComponent {
  invoices = input<Invoice[]>([]);
  loading = input(false);
  error = input<string | null>(null);

  readonly draftCount = computed(
    () => this.invoices().filter((i) => i.status === 'DRAFT').length,
  );

  readonly recentInvoices = computed(() =>
    [...this.invoices()]
      .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
      .slice(0, 6),
  );

  formatAmount(total: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(total);
  }

  statusSeverity(status: string): 'success' | 'info' | 'warn' | 'secondary' | 'danger' {
    switch (status) {
      case 'PAID':
        return 'success';
      case 'SENT':
        return 'info';
      case 'DRAFT':
        return 'warn';
      case 'VOID':
        return 'secondary';
      default:
        return 'info';
    }
  }
}
