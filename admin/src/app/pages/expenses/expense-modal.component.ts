import { Component, computed, signal, viewChild } from '@angular/core';
import { inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { AppDialogModule } from '../../core/app-dialog.module';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { DateInputComponent } from '../../ui/date-input/date-input.component';
import { Expense, ExpenseCategory, ExpensePaymentMethod, ExpenseProject, isMileageCategory } from './expense.types';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';
import { MoneyInputComponent } from '../../ui/money-input/money-input.component';
import { SingleFileDropzoneComponent } from '../../ui/single-file-dropzone/single-file-dropzone.component';
import type { RecordAttributionDto } from '@upstart/back-office/shared';
import { RecordAttributionComponent } from '../../ui/record-attribution/record-attribution.component';

export type ExpenseModalResult = 'saved' | 'deleted' | 'cancelled';

@Component({
  selector: 'app-expense-modal',
  standalone: true,
  imports: [HelpTextComponent, 
    FormsModule,
    AppDialogModule,
    ButtonModule,
    MessageModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    SelectModule,
    ToggleSwitchModule,
    DateInputComponent,
    MoneyInputComponent,
    SingleFileDropzoneComponent,
    RecordAttributionComponent,
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
  readonly attribution = signal<RecordAttributionDto | null>(null);
  projects = signal<ExpenseProject[]>([]);
  clients = signal<{ id: string; name: string }[]>([]);

  description = signal('');
  clientId = signal('');
  amount = signal<number | null>(null);
  category = signal('');
  incurredAt = signal(new Date().toISOString().slice(0, 10));
  projectId = signal('');
  isReimbursable = signal(false);
  isBillable = signal(false);
  paymentMethod = signal('');
  notes = signal('');
  miles = signal<number | null>(null);
  /** Rate per mile: the expense's own rate when editing a mileage expense, else the organization's current rate. */
  mileageRate = signal<number | null>(null);

  receiptFile: File | null = null;
  private receiptRemoved = false;

  private readonly receiptDropzone = viewChild<SingleFileDropzoneComponent>('receiptDropzone');

  categories = signal<ExpenseCategory[]>([]);
  paymentMethods = signal<ExpensePaymentMethod[]>([]);

  readonly categorySelectOptions = computed(() => {
    const list = this.categories();
    const current = this.category().trim();
    if (!current || list.some((c) => c.name.toLowerCase() === current.toLowerCase())) return list;
    return [
      ...list,
      { id: '_legacy', slug: null, name: current, sortOrder: 999, isActive: true },
    ] satisfies ExpenseCategory[];
  });

  readonly paymentMethodSelectOptions = computed(() => {
    const list = this.paymentMethods();
    const current = this.paymentMethod().trim();
    if (!current || list.some((m) => m.name.toLowerCase() === current.toLowerCase())) return list;
    return [
      ...list,
      { id: '_legacy', slug: null, name: current, sortOrder: 999, isActive: true },
    ] satisfies ExpensePaymentMethod[];
  });

  readonly clientOptions = computed(() =>
    [...this.clients()].sort((a, b) => a.name.localeCompare(b.name)),
  );

  readonly projectsForClient = computed(() => {
    const cid = this.clientId();
    if (!cid) return [];
    return this.projects().filter((p) => p.client?.id === cid);
  });

  readonly showProjectPicker = computed(() => !!this.clientId() && this.projectsForClient().length > 0);

  readonly projectOptions = computed(() =>
    this.projectsForClient().map((p) => ({
      id: p.id,
      projectName: p.name,
      clientName: p.client?.name ?? '',
    })),
  );

  readonly dialogTitle = computed(() => (this.isEdit() ? 'Edit expense' : 'New expense'));

  /** The invoice this expense is on, if any. While it is, amount, miles, category, project and the toggles are locked. */
  readonly lockedInvoice = computed(() => {
    const e = this.editingExpense();
    return e?.billingInvoice ?? e?.reimbursementInvoice ?? null;
  });

  readonly isMileage = computed(() => isMileageCategory(this.category(), this.categories()));

  /** Miles x rate, shown read-only for mileage. */
  readonly mileageAmount = computed(() => {
    const miles = this.miles();
    const rate = this.mileageRate();
    return miles != null && rate != null ? Math.round(miles * rate * 100) / 100 : null;
  });

  readonly canSubmit = computed(() => {
    if (!this.description().trim()) return false;
    if (this.isMileage()) return !!this.miles() && this.miles()! > 0 && this.mileageRate() != null;
    return !!this.amount() && this.amount()! > 0;
  });

  private resolve: ((result: ExpenseModalResult) => void) | null = null;

  open(options: { projects: ExpenseProject[]; expense?: Expense }): Promise<ExpenseModalResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.projects.set(options.projects);
      this.editingExpense.set(options.expense ?? null);
      this.isEdit.set(!!options.expense);
      this.attribution.set(options.expense?.attribution ?? null);
      this.error.set(null);
      this.receiptFile = null;
      this.receiptRemoved = false;
      this.receiptDropzone()?.reset();

      const e = options.expense;
      this.description.set(e?.description ?? '');
      this.amount.set(e?.amount ?? null);
      this.category.set(e?.category ?? '');
      this.incurredAt.set(e ? e.incurredAt.slice(0, 10) : new Date().toISOString().slice(0, 10));
      this.clientId.set(e?.project?.client?.id ?? '');
      this.projectId.set(e?.project?.id ?? '');
      this.isReimbursable.set(e?.isReimbursable ?? false);
      this.isBillable.set(e?.isBillable ?? false);
      this.paymentMethod.set(e?.paymentMethod ?? '');
      this.notes.set(e?.notes ?? '');
      this.miles.set(e?.miles != null ? Number(e.miles) : null);
      this.mileageRate.set(e?.mileageRate != null ? Number(e.mileageRate) : null);
      if (e?.mileageRate == null) void this.loadMileageRate();
      void this.loadClients();
      void this.loadCategories();
      void this.loadPaymentMethods();

      if (!e) this.applyExpenseDefaultsFromProject(this.projectId());
      if (e) void this.loadAttribution(e.id);

      this.visible = true;
    });
  }

  onClientChange(clientId: string | null) {
    const next = clientId ?? '';
    this.clientId.set(next);
    const pid = this.projectId();
    if (pid && !this.projectsForClient().some((p) => p.id === pid)) {
      this.projectId.set('');
      if (!this.isEdit()) this.applyExpenseDefaultsFromProject('');
    }
  }

  onProjectChange(projectId: string | null) {
    const id = projectId ?? '';
    this.projectId.set(id);
    const project = id ? this.projects().find((p) => p.id === id) : null;
    if (project?.client?.id) this.clientId.set(project.client.id);
    if (!this.isEdit()) this.applyExpenseDefaultsFromProject(id);
  }

  private async loadClients() {
    try {
      const rows = await this.api.get<{ id: string; name: string; isActive?: boolean }[]>('/clients?journey=CLIENT');
      this.clients.set(rows.filter((c) => c.isActive !== false).map((c) => ({ id: c.id, name: c.name })));
    } catch {
      const fromProjects = new Map<string, string>();
      for (const p of this.projects()) {
        if (p.client) fromProjects.set(p.client.id, p.client.name);
      }
      this.clients.set([...fromProjects].map(([id, name]) => ({ id, name })));
    }
  }

  /** New expenses only: set reimbursable/billable from the project (mileage still forces reimbursable). */
  private applyExpenseDefaultsFromProject(projectId: string) {
    const project = projectId ? this.projects().find((p) => p.id === projectId) : null;
    this.isBillable.set(project?.defaultExpenseBillable ?? false);
    this.isReimbursable.set(project?.defaultExpenseReimbursable ?? false);
    if (!this.isEdit() && isMileageCategory(this.category(), this.categories())) {
      this.isReimbursable.set(true);
    }
  }

  private async loadCategories() {
    try {
      this.categories.set(await this.api.get<ExpenseCategory[]>('/expense-categories'));
    } catch {
      this.categories.set([]);
    }
  }

  private async loadPaymentMethods() {
    try {
      this.paymentMethods.set(await this.api.get<ExpensePaymentMethod[]>('/expense-payment-methods'));
    } catch {
      this.paymentMethods.set([]);
    }
  }

  private async loadAttribution(expenseId: string) {
    try {
      const res = await this.api.get<{ attribution?: RecordAttributionDto }>(`/expenses/${expenseId}`);
      this.attribution.set(res.attribution ?? null);
    } catch {
      this.attribution.set(null);
    }
  }

  private async loadMileageRate() {
    try {
      const res = await this.api.get<{ rate: number | null }>('/expenses/mileage-rate');
      this.mileageRate.set(res.rate);
    } catch {
      this.mileageRate.set(null);
    }
  }

  /** Mileage is almost always paid back, so a new mileage expense starts as reimbursable. */
  onCategoryChange(value: string) {
    const wasMileage = isMileageCategory(this.category(), this.categories());
    this.category.set(value);
    const nowMileage = isMileageCategory(value, this.categories());
    if (wasMileage && !nowMileage) {
      this.miles.set(null);
    }
    if (!wasMileage && nowMileage) {
      if (!this.isEdit()) this.isReimbursable.set(true);
      if (this.mileageRate() == null) void this.loadMileageRate();
    }
  }

  onReceiptFile(file: File | null) {
    this.receiptFile = file;
    if (file) this.receiptRemoved = false;
  }

  onReceiptExistingCleared() {
    this.receiptFile = null;
    this.receiptRemoved = true;
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
      amount: this.isMileage() ? undefined : this.amount(),
      miles: this.isMileage() ? this.miles() : null,
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
      this.error.set(
        this.isMileage()
          ? this.mileageRate() == null
            ? 'Set a mileage rate in Settings → Expenses and Invoicing before adding mileage.'
            : 'Description and miles are required.'
          : 'Description and a positive amount are required.',
      );
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
        if (updated.attribution) {
          this.attribution.set(updated.attribution);
        } else {
          await this.loadAttribution(expenseId);
        }
      } else {
        const created = await this.api.post<Expense>('/expenses', this.payload());
        expenseId = created.id;
      }

      if (this.receiptRemoved) {
        await this.api.delete(`/expenses/${expenseId}/receipt`);
      } else if (this.receiptFile) {
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

  formatRate(n: number | null): string {
    return n == null ? '—' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }

  formatMoney(n: number | null): string {
    return n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }
}
