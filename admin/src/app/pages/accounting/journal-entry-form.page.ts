import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';

type Account = { id: string; code: string; name: string; type: string };

type LineDraft = { accountId: string; debit: number | null; credit: number | null };

@Component({
  selector: 'app-journal-entry-form-page',
  standalone: true,
  imports: [
    FormsModule, RouterLink, ButtonModule, InputTextModule, MessageModule, SelectModule, TableModule, PageComponent,
  ],
  templateUrl: './journal-entry-form.page.html',
})
export class JournalEntryFormPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);

  accounts = signal<Account[]>([]);
  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  date = new Date().toISOString().slice(0, 10);
  memo = '';
  lines = signal<LineDraft[]>([
    { accountId: '', debit: null, credit: null },
    { accountId: '', debit: null, credit: null },
  ]);

  readonly totalDebit = computed(() =>
    round2(this.lines().reduce((s, l) => s + (l.debit ?? 0), 0)),
  );
  readonly totalCredit = computed(() =>
    round2(this.lines().reduce((s, l) => s + (l.credit ?? 0), 0)),
  );
  readonly isBalanced = computed(
    () => this.totalDebit() === this.totalCredit() && this.totalDebit() > 0,
  );

  async ngOnInit() {
    try {
      this.accounts.set(await this.api.get<Account[]>('/accounting/accounts'));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load accounts');
    } finally {
      this.loading.set(false);
    }
  }

  addLine() {
    this.lines.update((lines) => [...lines, { accountId: '', debit: null, credit: null }]);
  }

  removeLine(index: number) {
    this.lines.update((lines) => lines.filter((_, i) => i !== index));
  }

  /** Debit and credit are mutually exclusive on a line — clear the other when one is entered. */
  onDebitChange(line: LineDraft) {
    if (line.debit) line.credit = null;
  }
  onCreditChange(line: LineDraft) {
    if (line.credit) line.debit = null;
  }

  async save() {
    const lines = this.lines().filter((l) => l.accountId && (l.debit || l.credit));
    if (lines.length < 2) {
      this.error.set('Add at least two lines with an account and an amount');
      return;
    }
    if (!this.isBalanced()) {
      this.error.set(`Entry does not balance: debits $${this.totalDebit().toFixed(2)} vs credits $${this.totalCredit().toFixed(2)}`);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.post('/accounting/journal', {
        date: this.date,
        memo: this.memo || undefined,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit || undefined,
          credit: l.credit || undefined,
        })),
      });
      this.toast.add({ severity: 'success', summary: 'Journal entry saved' });
      await this.router.navigate(['/accounting/journal']);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
