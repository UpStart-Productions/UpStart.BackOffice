import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ExpenseModalComponent } from './expense-modal.component';
import { Expense, ExpenseProject } from './expense.types';

type ProjectListItem = { id: string; name: string; isActive?: boolean; client: { id: string; name: string } };

@Component({
  selector: 'app-expenses-list-page',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    PageComponent,
    ExpenseModalComponent,
  ],
  templateUrl: './expenses-list.page.html',
  styleUrl: './expenses-list.page.scss',
})
export class ExpensesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly modal = viewChild.required(ExpenseModalComponent);

  expenses = signal<Expense[]>([]);
  projects = signal<ExpenseProject[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = signal('');

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  readonly filteredExpenses = computed(() => {
    const q = this.searchDebounced().trim().toLowerCase();
    if (!q) return this.expenses();
    return this.expenses().filter((e) => this.matchesSearch(e, q));
  });

  readonly totalAmount = computed(() =>
    this.filteredExpenses().reduce((sum, e) => sum + Number(e.amount), 0),
  );

  async ngOnInit() {
    await this.load();
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced.set(value);
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced.set('');
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  private matchesSearch(e: Expense, q: string): boolean {
    const haystack = [
      e.description,
      e.category ?? '',
      e.project?.name ?? '',
      e.project?.client.name ?? '',
      e.paymentMethod ?? '',
      [e.user.firstName, e.user.lastName].filter(Boolean).join(' '),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  }

  submittedByName(e: Expense): string {
    return [e.user.firstName, e.user.lastName].filter(Boolean).join(' ') || e.user.email;
  }

  formatAmount(n: number): string {
    return '$' + Number(n).toFixed(2);
  }

  async load() {
    this.loading.set(true);
    try {
      const [expenses, projects] = await Promise.all([
        this.api.get<Expense[]>('/expenses'),
        this.api.get<ProjectListItem[]>('/projects'),
      ]);
      this.expenses.set(expenses.map((e) => ({ ...e, amount: Number(e.amount) })));
      this.projects.set(projects.filter((p) => p.isActive !== false));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load expenses');
    } finally {
      this.loading.set(false);
    }
  }

  async openNew() {
    const result = await this.modal().open({ projects: this.projects() });
    if (result === 'saved' || result === 'deleted') await this.load();
  }

  async openEdit(expense: Expense) {
    const result = await this.modal().open({ projects: this.projects(), expense });
    if (result === 'saved' || result === 'deleted') await this.load();
  }
}
