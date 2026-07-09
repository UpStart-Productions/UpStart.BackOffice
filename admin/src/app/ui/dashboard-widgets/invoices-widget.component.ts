import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DashboardWidgetContentComponent } from '../dashboard-widget/dashboard-widget-content.component';
import { invoiceDueFlag, sortInvoicesForAttention } from '../../pages/invoices/invoice-status.util';

type Invoice = {
  id: string;
  displayNumber: string;
  status: string;
  issueDate: string;
  dueDate?: string;
  number?: number;
  total: number;
  client: { id: string; name: string };
};

@Component({
  selector: 'app-dashboard-invoices-widget',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule, DashboardWidgetContentComponent],
  template: `
    <app-dashboard-widget-content
      [loading]="loading()"
      [error]="error()"
      [empty]="recentInvoices().length === 0"
      emptyMessage="No invoices yet."
    >
      <div dashboardWidgetEmptyAction class="widget-footer">
        <a pButton label="Create invoice" icon="pi pi-plus" routerLink="/invoices/new"></a>
      </div>

      @if (overdueCount() > 0) {
        <p class="overdue-note">{{ overdueCount() }} overdue invoice{{ overdueCount() === 1 ? '' : 's' }}</p>
      } @else if (dueCount() > 0) {
        <p class="due-note">{{ dueCount() }} unpaid invoice{{ dueCount() === 1 ? '' : 's' }} due soon</p>
      }

      @if (draftCount() > 0) {
        <p class="draft-note">{{ draftCount() }} draft{{ draftCount() === 1 ? '' : 's' }} ready to send</p>
      }

      <ul class="dashboard-list">
        @for (inv of recentInvoices(); track inv.id) {
          <li
            class="dashboard-list-item"
            [class.dashboard-list-item--overdue]="dueFlag(inv) === 'overdue'"
            [class.dashboard-list-item--due]="dueFlag(inv) === 'due'"
          >
            <a
              [routerLink]="inv.status === 'DRAFT' ? ['/invoices', inv.id, 'edit'] : ['/invoices', inv.id]"
              class="dashboard-list-link"
            >
              <span class="dashboard-list-title">{{ inv.displayNumber }}</span>
              <span class="text-muted">{{ inv.client.name }}</span>
            </a>
            <div class="dashboard-list-right">
              <span class="dashboard-list-amount">{{ formatAmount(inv.total) }}</span>
              @if (dueFlagLabel(inv); as label) {
                <p-tag [value]="label" [severity]="dueFlagSeverity(inv)" />
              } @else {
                <p-tag [value]="inv.status" [severity]="statusSeverity(inv.status)" />
              }
            </div>
          </li>
        }
      </ul>
    </app-dashboard-widget-content>
  `,
  styles: [
    `
      .overdue-note {
        margin: 0 0 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-severity-danger-text);
      }

      .due-note {
        margin: 0 0 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-severity-warning-text);
      }

      .draft-note {
        margin: 0 0 0.875rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--color-severity-warning-text);
      }

      .dashboard-list-item--overdue {
        margin: 0 -0.5rem;
        padding: 0.625rem 0.5rem;
        border-radius: var(--content-border-radius);
        background: var(--color-severity-danger-bg);
      }

      .dashboard-list-item--due {
        margin: 0 -0.5rem;
        padding: 0.625rem 0.5rem;
        border-radius: var(--content-border-radius);
        background: var(--color-severity-warning-bg);
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

  readonly overdueCount = computed(
    () => this.invoices().filter((i) => invoiceDueFlag(i.dueDate, i.status) === 'overdue').length,
  );

  readonly dueCount = computed(
    () => this.invoices().filter((i) => invoiceDueFlag(i.dueDate, i.status) === 'due').length,
  );

  readonly recentInvoices = computed(() =>
    sortInvoicesForAttention(this.invoices()).slice(0, 6),
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

  dueFlag(invoice: Invoice) {
    return invoiceDueFlag(invoice.dueDate, invoice.status);
  }

  dueFlagLabel(invoice: Invoice): string | null {
    const flag = this.dueFlag(invoice);
    if (flag === 'overdue') return 'Overdue';
    if (flag === 'due') return 'Due';
    return null;
  }

  dueFlagSeverity(invoice: Invoice): 'success' | 'info' | 'warn' | 'secondary' | 'danger' {
    return this.dueFlag(invoice) === 'overdue' ? 'danger' : 'warn';
  }
}
