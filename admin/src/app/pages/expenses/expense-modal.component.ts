import { Component, computed, signal } from '@angular/core';
import { inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { Expense, ExpenseProject, SUGGESTED_EXPENSE_CATEGORIES } from './expense.types';

export type ExpenseModalResult = 'saved' | 'deleted' | 'cancelled';

@Component({
  selector: 'app-expense-modal',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    ButtonModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    ToggleSwitchModule,
    DateInputComponent,
  ],
  templateUrl: './expense-modal.component.html',
  styleUrl: './expense-modal.component.scss',
})
export class ExpenseModalComponent {
  private readonly api = inject(ApiService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  visible = false;
  saving = signal(false);
  error = signal<string | null>(null);
  isEdit = signal(false);
  editingExpense = signal<Expense | null>(null);
  projects = signal<ExpenseProject[]>([]);

  description = signal('');
  amount = signal<number | null>(null);
  category = signal('');
  incurredAt = signal(new Date().toISOString().slice(0, 10));
  projectId = signal('');
  isReimbursable = signal(false);
  isBillable = signal(false);
  paymentMethod = signal('');
  notes = signal('');

  receiptFile: File | null = null;
  receiptPreviewName = signal<string | null>(null);

  readonly categoryOptions = SUGGESTED_EXPENSE_CATEGORIES;

  readonly projectOptions = computed(() =>
    this.projects().map((p) => ({ id: p.id, projectName: p.name, clientName: p.client.name })),
  );

  readonly dialogTitle = computed(() => (this.isEdit() ? 'Edit expense' : 'New expense'));

  readonly canSubmit = computed(() => !!this.description().trim() && !!this.amount() && this.amount()! > 0);

  readonly existingReceiptUrl = computed(() => {
    const url = this.editingExpense()?.receiptUrl;
    return url ? resolveAssetUrl(url) : null;
  });

  private resolve: ((result: ExpenseModalResult) => void) | null = null;

  open(options: { projects: ExpenseProject[]; expense?: Expense }): Promise<ExpenseModalResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.projects.set(options.projects);
      this.editingExpense.set(options.expense ?? null);
      this.isEdit.set(!!options.expense);
      this.error.set(null);
      this.receiptFile = null;
      this.receiptPreviewName.set(null);

      const e = options.expense;
      this.description.set(e?.description ?? '');
      this.amount.set(e?.amount ?? null);
      this.category.set(e?.category ?? '');
      this.incurredAt.set(e ? e.incurredAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
      this.projectId.set(e?.project?.id ?? '');
      this.isReimbursable.set(e?.isReimbursable ?? false);
      this.isBillable.set(e?.isBillable ?? false);
      this.paymentMethod.set(e?.paymentMethod ?? '');
      this.notes.set(e?.notes ?? '');

      this.visible = true;
    });
  }

  onReceiptSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.receiptFile = file;
    this.receiptPreviewName.set(file?.name ?? null);
  }

  onDialogHide() {
    this.error.set(null);
  }

  cancel() {
    this.visible = false;
    this.resolve?.('cancelled');
    this.resolve = null;
  }

  private payload() {
    return {
      description: this.description().trim(),
      amount: this.amount(),
      category: this.category().trim() || undefined,
      incurredAt: new Date(this.incurredAt()).toISOString(),
      projectId: this.projectId() || undefined,
      isReimbursable: this.isReimbursable(),
      isBillable: this.isBillable(),
      paymentMethod: this.paymentMethod().trim() || undefined,
      notes: this.notes().trim() || undefined,
    };
  }

  async save() {
    if (!this.canSubmit()) {
      this.error.set('Description and a positive amount are required.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const existing = this.editingExpense();
      let expenseId: string;
      if (existing) {
        const updated = await this.api.put<Expense>(`/expenses/${existing.id}`, this.payload());
        expenseId = updated.id;
      } else {
        const created = await this.api.post<Expense>('/expenses', this.payload());
        expenseId = created.id;
      }

      if (this.receiptFile) {
        await this.api.uploadFile(`/expenses/${expenseId}/receipt`, this.receiptFile);
      }

      this.visible = false;
      this.resolve?.('saved');
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      this.saving.set(false);
    }
  }

  deleteExpense() {
    const existing = this.editingExpense();
    if (!existing) return;

    this.deleteConfirm.confirm({
      message: `Delete "${existing.description}"? This cannot be undone.`,
      accept: () => this.performDelete(existing.id),
    });
  }

  private async performDelete(id: string) {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.delete(`/expenses/${id}`);
      this.visible = false;
      this.resolve?.('deleted');
      this.resolve = null;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      this.saving.set(false);
    }
  }
}
