import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { DateInputComponent } from '../../ui/date-input/date-input.component';

type BalanceRow = { id: string; code: string; name: string; balance: number };
type TrialBalanceRow = { id: string; code: string; name: string; type: string; debit: number; credit: number };

type ProfitLoss = {
  from: string;
  to: string;
  revenue: BalanceRow[];
  expenses: BalanceRow[];
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
};

type BalanceSheet = {
  asOf: string;
  assets: BalanceRow[];
  liabilities: BalanceRow[];
  equity: BalanceRow[];
  retainedEarnings: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  balanced: boolean;
};

type TrialBalance = {
  asOf: string;
  rows: TrialBalanceRow[];
  totals: { debit: number; credit: number };
};

function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-accounting-reports-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule, TableModule, TabsModule, PageComponent, DateInputComponent],
  templateUrl: './accounting-reports.page.html',
})
export class AccountingReportsPage implements OnInit {
  private readonly api = inject(ApiService);

  activeTab = signal(0);
  loading = signal(false);
  error = signal<string | null>(null);

  from = firstOfYear();
  to = today();
  asOf = today();

  profitLoss = signal<ProfitLoss | null>(null);
  balanceSheet = signal<BalanceSheet | null>(null);
  trialBalance = signal<TrialBalance | null>(null);

  async ngOnInit() {
    await this.runAll();
  }

  async runAll() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [pl, bs, tb] = await Promise.all([
        this.api.get<ProfitLoss>(`/accounting/reports/profit-loss?from=${this.from}&to=${this.to}`),
        this.api.get<BalanceSheet>(`/accounting/reports/balance-sheet?asOf=${this.asOf}`),
        this.api.get<TrialBalance>(`/accounting/reports/trial-balance?asOf=${this.asOf}`),
      ]);
      this.profitLoss.set(pl);
      this.balanceSheet.set(bs);
      this.trialBalance.set(tb);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      this.loading.set(false);
    }
  }

  formatCurrency(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }

  equityRows(bs: BalanceSheet): BalanceRow[] {
    return [
      ...bs.equity,
      { id: 'retained-earnings', code: '', name: 'Retained Earnings', balance: bs.retainedEarnings },
    ];
  }
}
