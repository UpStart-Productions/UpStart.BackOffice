import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { ExpensePaymentMethod } from '../../pages/expenses/expense.types';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

@Component({
  selector: 'app-expense-payment-methods-settings',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    AppDialogModule,
    RowActionsMenuComponent,
  ],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" class="mb-3 block" />
    }

    <div class="field-action-row toolbar">
      <input
        pInputText
        [(ngModel)]="newName"
        placeholder="New payment method"
        class="flex-1"
        aria-label="New expense payment method name"
        (keydown.enter)="addMethod()"
      />
      <p-button label="Add" icon="pi pi-plus" size="small" [loading]="adding()" [disabled]="!newName.trim()" (onClick)="addMethod()" />
    </div>

    <p-table [value]="methods()" [loading]="loading()" styleClass="table-bordered mt-3">
      <ng-template pTemplate="header">
        <tr>
          <th style="width: 3rem"></th>
          <th>Name</th>
          <th>Used on</th>
          <th>Status</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-row>
        <tr [class.text-color-secondary]="!row.isActive">
          <td>
            <app-row-actions-menu [items]="rowActions(row)" />
          </td>
          <td>{{ row.name }}</td>
          <td>{{ row.expenseCount ?? 0 }}</td>
          <td>
            @if (row.isActive) {
              <p-tag value="Active" severity="success" />
            } @else {
              <p-tag value="Inactive" severity="secondary" />
            }
          </td>
        </tr>
      </ng-template>
      <ng-template pTemplate="emptymessage">
        <tr>
          <td colspan="4">No payment methods yet.</td>
        </tr>
      </ng-template>
    </p-table>

    <p-dialog header="Edit payment method" [(visible)]="editVisible" [modal]="true" [style]="{ width: '24rem' }">
      @if (editing) {
        <div class="form-field">
          <label for="editPaymentMethodName">Name</label>
          <input pInputText id="editPaymentMethodName" class="w-full" [(ngModel)]="editName" />
        </div>
        <div class="form-actions mt-3">
          <p-button label="Save" icon="pi pi-check" [loading]="savingEdit()" (onClick)="saveEdit()" />
          <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="editVisible = false" />
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .toolbar {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .toolbar input {
      min-width: 12rem;
      max-width: 20rem;
    }
  `,
})
export class ExpensePaymentMethodsSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  methods = signal<ExpensePaymentMethod[]>([]);
  loading = signal(true);
  adding = signal(false);
  error = signal<string | null>(null);

  newName = '';

  editVisible = false;
  editing: ExpensePaymentMethod | null = null;
  editName = '';
  savingEdit = signal(false);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      this.methods.set(await this.api.get<ExpensePaymentMethod[]>('/expense-payment-methods/manage'));
      this.error.set(null);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load payment methods');
    } finally {
      this.loading.set(false);
    }
  }

  rowActions(row: ExpensePaymentMethod): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.startEdit(row) },
    ];
    if (!row.isActive) {
      items.push({
        id: 'restore',
        label: 'Restore',
        icon: 'pi pi-replay',
        command: () => void this.restore(row),
      });
    } else {
      items.push({
        id: 'delete',
        label: 'Remove',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmRemove(row),
      });
    }
    return items;
  }

  async addMethod() {
    const name = this.newName.trim();
    if (!name) return;
    this.adding.set(true);
    try {
      await this.api.post('/expense-payment-methods', { name });
      this.newName = '';
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Added', detail: 'Payment method added.' });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not add',
        detail: err instanceof Error ? err.message : 'Failed to add payment method',
      });
    } finally {
      this.adding.set(false);
    }
  }

  startEdit(row: ExpensePaymentMethod) {
    this.editing = row;
    this.editName = row.name;
    this.editVisible = true;
  }

  async saveEdit() {
    if (!this.editing) return;
    const name = this.editName.trim();
    if (!name) return;
    this.savingEdit.set(true);
    try {
      await this.api.put(`/expense-payment-methods/${this.editing.id}`, { name });
      this.editVisible = false;
      this.editing = null;
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Payment method updated.' });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not save',
        detail: err instanceof Error ? err.message : 'Failed to update payment method',
      });
    } finally {
      this.savingEdit.set(false);
    }
  }

  confirmRemove(row: ExpensePaymentMethod) {
    this.confirmDelete.confirm({
      message: `Remove "${row.name}" from the list? Built-in methods are hidden, not deleted.`,
      accept: () => void this.remove(row),
    });
  }

  async remove(row: ExpensePaymentMethod) {
    try {
      await this.api.delete(`/expense-payment-methods/${row.id}`);
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Removed', detail: 'Payment method removed.' });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not remove',
        detail: err instanceof Error ? err.message : 'Failed to remove payment method',
      });
    }
  }

  async restore(row: ExpensePaymentMethod) {
    try {
      await this.api.put(`/expense-payment-methods/${row.id}`, { isActive: true });
      await this.load();
      this.toast.add({ severity: 'success', summary: 'Restored', detail: 'Payment method is active again.' });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not restore',
        detail: err instanceof Error ? err.message : 'Failed to restore payment method',
      });
    }
  }
}
