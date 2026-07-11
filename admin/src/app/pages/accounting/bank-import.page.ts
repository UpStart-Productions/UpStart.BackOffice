import { Component, OnInit, ViewChild, ElementRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';

type Account = { id: string; code: string; name: string; type: string };

type BankTransaction = {
  id: string;
  date: string;
  description: string;
  amount: number;
  accountId?: string | null;
  journalEntryId?: string | null;
  account?: { id: string; code: string; name: string } | null;
  suggestedAccount?: { id: string; code: string; name: string } | null;
  pendingAccountId?: string; // UI-only draft field
};

@Component({
  selector: 'app-bank-import-page',
  standalone: true,
  imports: [
    FormsModule, ButtonModule, MessageModule, SelectModule, TableModule, TagModule, PageComponent,
  ],
  templateUrl: './bank-import.page.html',
})
export class BankImportPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  accounts = signal<Account[]>([]);
  transactions = signal<BankTransaction[]>([]);
  loading = signal(true);
  importing = signal(false);
  postingId = signal<string | null>(null);
  postingAllSuggested = signal(false);
  uncategorizedOnly = signal(true);
  error = signal<string | null>(null);

  readonly suggestedCount = computed(
    () => this.transactions().filter((t) => !t.journalEntryId && t.suggestedAccount).length,
  );

  async ngOnInit() {
    await Promise.all([this.loadAccounts(), this.load()]);
  }

  async loadAccounts() {
    try {
      this.accounts.set(await this.api.get<Account[]>('/accounting/accounts'));
    } catch {
      // Reported by load() if it also fails; accounts list simply stays empty otherwise.
    }
  }

  async load() {
    this.loading.set(true);
    try {
      const path = this.uncategorizedOnly()
        ? '/accounting/bank/transactions?uncategorizedOnly=true'
        : '/accounting/bank/transactions';
      const transactions = await this.api.get<BankTransaction[]>(path);
      // Pre-fill the picker from the learned suggestion so posting a matched row is a single click.
      for (const t of transactions) {
        if (!t.journalEntryId && t.suggestedAccount) {
          t.pendingAccountId = t.suggestedAccount.id;
        }
      }
      this.transactions.set(transactions);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load bank transactions');
    } finally {
      this.loading.set(false);
    }
  }

  toggleUncategorizedOnly() {
    this.uncategorizedOnly.update((v) => !v);
    this.load();
  }

  triggerFilePicker() {
    this.fileInput?.nativeElement.click();
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.importing.set(true);
    this.error.set(null);
    try {
      const fileBase64 = await this.fileToBase64(file);
      const result = await this.api.post<{ imported: number; skipped: number; total: number }>(
        '/accounting/bank/import',
        { fileBase64 },
      );
      this.toast.add({
        severity: 'success',
        summary: 'Import complete',
        detail: `Imported ${result.imported} transaction${result.imported === 1 ? '' : 's'}${result.skipped ? ` (${result.skipped} already imported)` : ''}.`,
        life: 6000,
      });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Import failed');
    } finally {
      this.importing.set(false);
      input.value = '';
    }
  }

  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.includes(',') ? result.split(',')[1]! : result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  async post(txn: BankTransaction) {
    if (!txn.pendingAccountId) {
      this.error.set('Choose an account before posting');
      return;
    }
    this.postingId.set(txn.id);
    this.error.set(null);
    try {
      await this.api.post(`/accounting/bank/transactions/${txn.id}/categorize`, {
        accountId: txn.pendingAccountId,
      });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post transaction');
    } finally {
      this.postingId.set(null);
    }
  }

  async postAllSuggested() {
    this.postingAllSuggested.set(true);
    this.error.set(null);
    try {
      const result = await this.api.post<{ posted: number; skipped: number }>(
        '/accounting/bank/transactions/post-suggested',
      );
      this.toast.add({
        severity: 'success',
        summary: 'Posted',
        detail: `Posted ${result.posted} transaction${result.posted === 1 ? '' : 's'} from learned categories.`,
        life: 6000,
      });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to post suggested transactions');
    } finally {
      this.postingAllSuggested.set(false);
    }
  }

  confirmDelete(txn: BankTransaction) {
    this.deleteConfirm.confirm({
      message: `Delete "${txn.description}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/accounting/bank/transactions/${txn.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }

  formatCurrency(n: number): string {
    const sign = n < 0 ? '-' : '';
    return `${sign}$${Math.abs(n).toFixed(2)}`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
