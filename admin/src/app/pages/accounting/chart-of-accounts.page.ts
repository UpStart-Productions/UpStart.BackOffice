import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isActive: boolean;
  balance: number;
};

const TYPE_OPTIONS: { label: string; value: AccountType }[] = [
  { label: 'Asset', value: 'ASSET' },
  { label: 'Liability', value: 'LIABILITY' },
  { label: 'Equity', value: 'EQUITY' },
  { label: 'Revenue', value: 'REVENUE' },
  { label: 'Expense', value: 'EXPENSE' },
];

const TYPE_SEVERITY: Record<AccountType, 'info' | 'warn' | 'secondary' | 'success' | 'danger'> = {
  ASSET: 'info',
  LIABILITY: 'warn',
  EQUITY: 'secondary',
  REVENUE: 'success',
  EXPENSE: 'danger',
};

@Component({
  selector: 'app-chart-of-accounts-page',
  standalone: true,
  imports: [
    FormsModule, ButtonModule, InputTextModule, MessageModule, SelectModule, TableModule, TagModule, PageComponent,
  ],
  templateUrl: './chart-of-accounts.page.html',
})
export class ChartOfAccountsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  readonly typeOptions = TYPE_OPTIONS;

  accounts = signal<Account[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  showAddForm = signal(false);
  editingId = signal<string | null>(null);

  newAccount = { code: '', name: '', type: 'EXPENSE' as AccountType };
  editDraft = { name: '', isActive: true };

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.accounts.set(await this.api.get<Account[]>('/accounting/accounts'));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load chart of accounts');
    } finally {
      this.loading.set(false);
    }
  }

  typeSeverity(type: AccountType) {
    return TYPE_SEVERITY[type];
  }

  formatCurrency(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }

  toggleAddForm() {
    this.showAddForm.update((v) => !v);
    this.error.set(null);
  }

  async createAccount() {
    if (!this.newAccount.code.trim() || !this.newAccount.name.trim()) {
      this.error.set('Code and name are required');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.post('/accounting/accounts', {
        code: this.newAccount.code.trim(),
        name: this.newAccount.name.trim(),
        type: this.newAccount.type,
      });
      this.newAccount = { code: '', name: '', type: 'EXPENSE' };
      this.showAddForm.set(false);
      this.toast.add({ severity: 'success', summary: 'Account added' });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      this.saving.set(false);
    }
  }

  startEdit(account: Account) {
    this.editingId.set(account.id);
    this.editDraft = { name: account.name, isActive: account.isActive };
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  async saveEdit(account: Account) {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.put(`/accounting/accounts/${account.id}`, { ...this.editDraft });
      this.editingId.set(null);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      this.saving.set(false);
    }
  }
}
