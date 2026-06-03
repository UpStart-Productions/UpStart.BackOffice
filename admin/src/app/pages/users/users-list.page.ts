import { Component, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { CognitoAuthService } from '../../core/cognito-auth.service';
import { SessionService } from '../../core/session.service';
import { PageComponent } from '../../ui/layout/page.component';
import {
  RowActionsMenuComponent,
  RowActionItem,
} from '../../ui/row-actions-menu/row-actions-menu.component';
import {
  AddEditUserModalComponent,
  type UserRow,
} from '../../ui/add-edit-user-modal/add-edit-user-modal.component';
import type { UserListDto } from '@upstart/back-office/shared';

type SortBy = 'name' | 'email' | 'role';

@Component({
  selector: 'app-users-list-page',
  standalone: true,
  imports: [
    FormsModule,
    PageComponent,
    TableModule,
    ButtonModule,
    MessageModule,
    InputTextModule,
    IconFieldModule,
    InputIconModule,
    SelectModule,
    TagModule,
    ToastModule,
    RowActionsMenuComponent,
    AddEditUserModalComponent,
  ],
  providers: [MessageService],
  templateUrl: './users-list.page.html',
})
export class UsersListPage {
  private readonly api = inject(ApiService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly session = inject(SessionService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly toast = inject(MessageService);

  users = signal<UserRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  searchQuery = '';
  searchDebounced = '';
  sortBy: SortBy = 'name';
  sortOptions = [
    { label: 'Name A-Z', value: 'name' as const },
    { label: 'Email A-Z', value: 'email' as const },
    { label: 'Role A-Z', value: 'role' as const },
  ];

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  addEditModalRef = viewChild<AddEditUserModalComponent>('addEditModal');

  ngOnInit() {
    void this.load();
  }

  get filteredUsers(): UserRow[] {
    let list = this.users();
    const q = this.searchDebounced.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          (u.name ?? '').toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (this.sortBy === 'name') {
        return (a.name ?? a.email).localeCompare(b.name ?? b.email);
      }
      if (this.sortBy === 'email') return a.email.localeCompare(b.email);
      return a.role.localeCompare(b.role);
    });
  }

  onSearchInput(value: string) {
    this.searchQuery = value;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchDebounced = value;
      this.searchTimer = null;
    }, 150);
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchDebounced = '';
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  roleLabel(role: string): string {
    return role === 'ADMIN' ? 'Admin' : 'User';
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { users } = await this.api.get<{ users: UserListDto[] }>('/users');
      this.users.set(users);
    } catch (err) {
      this.users.set([]);
      this.error.set(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      this.loading.set(false);
    }
  }

  async openAdd() {
    const modal = this.addEditModalRef();
    if (await modal?.open()) await this.afterUserSaved();
  }

  async openEdit(user: UserRow) {
    const modal = this.addEditModalRef();
    if (await modal?.open(user)) await this.afterUserSaved();
  }

  private async afterUserSaved() {
    await this.load();
    await this.session.refresh();
  }

  async toggleActive(user: UserRow) {
    try {
      await this.api.patch(`/users/${user.id}/active`, { isActive: !user.isActive });
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to update user');
    }
  }

  async invite(user: UserRow) {
    try {
      const result = await this.api.post<{ sent: boolean; message: string }>(`/users/${user.id}/invite`);
      this.toast.add({
        severity: result.sent ? 'success' : 'info',
        summary: result.sent ? 'Invitation sent' : 'Already set up',
        detail: result.message,
        life: 8000,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to send invite');
    }
  }

  confirmDelete(user: UserRow) {
    this.deleteConfirm.confirm({
      message: `Delete ${user.email}? Their time entries will also be removed.`,
      accept: async () => {
        try {
          await this.api.delete(`/users/${user.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to delete user');
        }
      },
    });
  }

  getRowActions(user: UserRow): RowActionItem[] {
    const actions: RowActionItem[] = [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(user) },
    ];
    if (this.useCognito) {
      actions.push({
        id: 'invite',
        label: 'Send sign-in invite',
        icon: 'pi pi-envelope',
        command: () => this.invite(user),
      });
    }
    actions.push(
      {
        id: user.isActive ? 'disable' : 'enable',
        label: user.isActive ? 'Disable' : 'Enable',
        icon: user.isActive ? 'pi pi-ban' : 'pi pi-check-circle',
        severity: 'warn',
        command: () => this.toggleActive(user),
      },
      {
        id: 'delete',
        label: 'Delete',
        icon: 'pi pi-trash',
        severity: 'danger',
        command: () => this.confirmDelete(user),
      },
    );
    return actions;
  }

  get useCognito() {
    return this.cognito.useCognito;
  }
}
