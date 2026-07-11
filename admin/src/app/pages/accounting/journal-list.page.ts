import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';

type JournalEntrySource = 'MANUAL' | 'INVOICE_ISSUED' | 'INVOICE_PAYMENT' | 'BANK_IMPORT';

type JournalLine = {
  id: string;
  debit: number;
  credit: number;
  account: { id: string; code: string; name: string };
};

type JournalEntry = {
  id: string;
  date: string;
  memo?: string | null;
  source: JournalEntrySource;
  invoice?: { id: string; displayNumber: string } | null;
  lines: JournalLine[];
};

const SOURCE_LABEL: Record<JournalEntrySource, string> = {
  MANUAL: 'Manual',
  INVOICE_ISSUED: 'Invoice issued',
  INVOICE_PAYMENT: 'Invoice payment',
  BANK_IMPORT: 'Bank import',
};

@Component({
  selector: 'app-journal-list-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, MessageModule, TableModule, TagModule, PageComponent],
  templateUrl: './journal-list.page.html',
})
export class JournalListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  entries = signal<JournalEntry[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.entries.set(await this.api.get<JournalEntry[]>('/accounting/journal'));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load the journal');
    } finally {
      this.loading.set(false);
    }
  }

  sourceLabel(source: JournalEntrySource): string {
    return SOURCE_LABEL[source];
  }

  totalDebit(entry: JournalEntry): number {
    return entry.lines.reduce((s, l) => s + Number(l.debit), 0);
  }

  lineSummary(entry: JournalEntry): string {
    return entry.lines
      .map((l) => `${l.account.name} ${Number(l.debit) > 0 ? 'Dr' : 'Cr'} ${this.formatCurrency(Number(l.debit) || Number(l.credit))}`)
      .join(' · ');
  }

  formatCurrency(n: number): string {
    return '$' + n.toFixed(2);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  confirmDelete(entry: JournalEntry) {
    this.deleteConfirm.confirm({
      message: `Delete this journal entry${entry.memo ? ` ("${entry.memo}")` : ''}? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/accounting/journal/${entry.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
