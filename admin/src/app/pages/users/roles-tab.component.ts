import { Component, inject, OnInit, output, signal, viewChild } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import type { UserListDto } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { AddEditUserModalComponent } from '../../ui/add-edit-user-modal/add-edit-user-modal.component';
import { CopyEmailComponent } from '../../ui/copy-email/copy-email.component';
import { PersonComponent } from '../../ui/person/person.component';

type RoleUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
  isActive: boolean;
};

type RoleRow = {
  id: string;
  name: string;
  key: string | null;
  description: string;
  userCount: number;
  previewUsers?: RoleUser[];
};

const ADMIN_DESCRIPTION =
  'Everything in the business, including users, settings, setup, accounting, reports and all invoices. Only admins can delete records and projects.';


/**
 * Roles tab on the Users page. Roles are fixed: Admin, Member and Guest. Nothing here is editable.
 * Which projects someone sees comes from project assignment (Lead or Member), and which clients from client assignment.
 */
@Component({
  selector: 'app-roles-tab',
  standalone: true,
  imports: [
    PersonComponent,
    CopyEmailComponent,
    AddEditUserModalComponent,
    TableModule,
    MessageModule,
    AppDialogModule,
  ],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-3" />
    }
    <p-table [value]="rows()" [loading]="loading()" styleClass="table-bordered">
      <ng-template pTemplate="header">
        <tr>
          <th class="role-col">Role</th>
          <th>What they can do</th>
          <th class="role-members-col">Members</th>
        </tr>
      </ng-template>
      <ng-template pTemplate="body" let-role>
        <tr>
          <td class="role-col">{{ role.name }}</td>
          <td>{{ role.description }}</td>
          <td class="role-members-col">
            <button
              type="button"
              class="role-members-cell"
              [class.role-members-cell--empty]="!role.userCount"
              [disabled]="!role.userCount"
              [attr.aria-label]="membersAriaLabel(role)"
              (click)="openUsers(role)"
            >
              @if (role.userCount) {
                <span class="role-avatar-stack">
                  @for (u of previewUsers(role); track u.id) {
                    <span class="role-avatar-stack-item">
                      <app-person
                        [avatarOnly]="true"
                        [name]="u.name"
                        [firstName]="u.firstName"
                        [lastName]="u.lastName"
                        [email]="u.email"
                        [avatarUrl]="u.avatarUrl"
                        [personId]="u.id"
                        size="med"
                      />
                    </span>
                  }
                  @if (extraCount(role) > 0 && previewUsers(role).length > 0) {
                    <span class="role-avatar-more">+{{ extraCount(role) }}</span>
                  }
                </span>
              }
            </button>
          </td>
        </tr>
      </ng-template>
    </p-table>
    <p class="text-color-secondary mt-3">
      On each project, a person is a Lead or a Member. Leads see everyone's time, expenses and invoices on that project
      and manage its people. Members see the project's tasks and files, and only their own time and expenses.
    </p>

    <p-dialog
      [header]="usersRole() ? 'Users with ' + usersRole()!.name : 'Users'"
      [visible]="!!usersRole()"
      (visibleChange)="!$event && usersRole.set(null)"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(32rem, 96vw)' }"
    >
      @if (usersLoading()) {
        <p class="text-color-secondary">Loading…</p>
      } @else if (usersError()) {
        <p-message severity="error" [text]="usersError()!" />
      } @else if (roleUsers().length === 0) {
        <p class="text-color-secondary">No one has this role yet.</p>
      } @else {
        <ul class="role-users">
          @for (u of roleUsers(); track u.id) {
            <li [class.inactive]="!u.isActive">
              <button type="button" class="role-user-row" (click)="openUserRecord(u)">
                <app-person
                  [name]="u.name"
                  [firstName]="u.firstName"
                  [lastName]="u.lastName"
                  [email]="u.email"
                  [avatarUrl]="u.avatarUrl"
                  [personId]="u.id"
                  [subtitle]="userRowSubtitle(u)"
                  size="lg"
                />
                <app-copy-email [email]="u.email" [muted]="true" [block]="true" />
              </button>
            </li>
          }
        </ul>
      }
    </p-dialog>

    <app-add-edit-user-modal #editUserModal />
  `,
  styles: `
    .role-col {
      width: 10rem;
      white-space: nowrap;
      font-weight: 600;
    }
    .role-members-col {
      width: 9.5rem;
      white-space: nowrap;
    }
    .role-members-cell {
      display: inline-flex;
      align-items: center;
      border: none;
      background: transparent;
      padding: 0.35rem 0.5rem;
      margin: -0.35rem -0.5rem;
      border-radius: var(--content-border-radius, 6px);
      cursor: pointer;
      font: inherit;
      color: inherit;
      max-width: 100%;
    }
    .role-members-cell:not(:disabled):hover {
      background: var(--surface-hover, var(--surface-100));
    }
    .role-members-cell--empty {
      cursor: default;
    }
    .role-avatar-stack {
      display: inline-flex;
      align-items: center;
    }
    .role-avatar-stack-item {
      display: inline-flex;
      margin-inline-start: -0.45rem;
      border-radius: 50%;
      box-shadow: 0 0 0 2px var(--surface-card, #fff);
    }
    .role-avatar-stack-item:first-child {
      margin-inline-start: 0;
    }
    .role-avatar-more {
      margin-inline-start: 0.4rem;
      font-size: var(--fs-sm);
      font-weight: 600;
      color: var(--text-color-secondary);
    }
    .role-users {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .role-users li {
      margin: 0;
    }
    .role-users li.inactive .role-user-row {
      opacity: 0.65;
    }
    .role-user-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      width: 100%;
      margin: 0;
      padding: 0.5rem 0.65rem;
      border: none;
      border-radius: var(--content-border-radius, 6px);
      background: transparent;
      cursor: pointer;
      font: inherit;
      color: inherit;
      text-align: left;
    }
    .role-user-row:hover {
      background: var(--surface-hover, var(--surface-100));
    }
    .role-user-row app-copy-email {
      flex-shrink: 0;
      max-width: 55%;
    }
  `,
})
export class RolesTabComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly editUserModal = viewChild<AddEditUserModalComponent>('editUserModal');

  /** Kept for the Users page binding; roles never change here. */
  readonly changed = output<void>();


  rows = signal<RoleRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  usersRole = signal<RoleRow | null>(null);
  roleUsers = signal<RoleUser[]>([]);
  usersLoading = signal(false);
  usersError = signal<string | null>(null);
  private adminUsers = signal<RoleUser[]>([]);
  private directoryUsers = signal<UserListDto[]>([]);

  ngOnInit() {
    void this.load();
  }

  previewUsers(role: RoleRow): RoleUser[] {
    return (role.previewUsers ?? []).slice(0, 3);
  }

  /** Users beyond the three avatars shown (only when total > 3). */
  extraCount(role: RoleRow): number {
    if (role.userCount <= 3) return 0;
    return role.userCount - 3;
  }

  membersAriaLabel(role: RoleRow): string {
    if (!role.userCount) return `No users with ${role.name}`;
    return `View ${role.userCount} user${role.userCount === 1 ? '' : 's'} with ${role.name}`;
  }

  private toRoleUser(u: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
    isActive: boolean;
  }): RoleUser {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName ?? null,
      lastName: u.lastName ?? null,
      name: u.name ?? null,
      avatarUrl: u.avatarUrl ?? null,
      isActive: u.isActive,
    };
  }

  private previewsForRole(users: UserListDto[], roleId: string): RoleUser[] {
    return users
      .filter((u) => u.role === 'USER' && u.roleId === roleId)
      .slice(0, 3)
      .map((u) => this.toRoleUser(u));
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [roles, userPayload] = await Promise.all([
        this.api.get<RoleRow[]>('/roles'),
        this.api.get<{ users: UserListDto[] }>('/users'),
      ]);
      const allUsers = userPayload.users ?? [];
      this.directoryUsers.set(allUsers);
      const admins = allUsers.filter((u) => u.role === 'ADMIN').map((u) => this.toRoleUser(u));
      this.adminUsers.set(admins);
      const adminRow: RoleRow = {
        id: '',
        name: 'Admin',
        key: null,
        description: ADMIN_DESCRIPTION,
        userCount: admins.length,
        previewUsers: admins.slice(0, 3),
      };
      const tenantRoles = roles.map((r) => ({
        ...r,
        previewUsers: this.previewsForRole(allUsers, r.id),
      }));
      this.rows.set([adminRow, ...tenantRoles]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not load roles');
    } finally {
      this.loading.set(false);
    }
  }

  userRowSubtitle(u: RoleUser): string | null {
    return u.isActive ? null : 'Disabled';
  }

  async openUserRecord(u: RoleUser) {
    const full = this.directoryUsers().find((row) => row.id === u.id);
    if (!full) return;
    const modal = this.editUserModal();
    if (!(await modal?.open(full))) return;
    await this.load();
    this.changed.emit();
    if (this.usersRole()) {
      const role = this.usersRole()!;
      if (!role.id) {
        this.roleUsers.set(this.adminUsers());
      } else {
        try {
          this.roleUsers.set(await this.api.get<RoleUser[]>(`/roles/${role.id}/users`));
        } catch {
          // List modal still shows prior rows until closed.
        }
      }
    }
  }

  async openUsers(role: RoleRow) {
    if (!role.userCount) return;
    this.usersRole.set(role);
    this.roleUsers.set([]);
    this.usersError.set(null);
    if (!role.id) {
      this.roleUsers.set(this.adminUsers());
      return;
    }
    this.usersLoading.set(true);
    try {
      this.roleUsers.set(await this.api.get<RoleUser[]>(`/roles/${role.id}/users`));
    } catch (e) {
      this.usersError.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not load users');
    } finally {
      this.usersLoading.set(false);
    }
  }
}
