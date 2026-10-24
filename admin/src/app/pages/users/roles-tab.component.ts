import { Component, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import {
  OWNABLE_AREAS,
  PERMISSION_AREAS,
  PERMISSION_LABELS,
  type AccessLevel,
  type PermissionArea,
  type RolePermissions,
} from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

type RoleRow = { id: string; name: string; permissions: RolePermissions; userCount: number };
type Level = 'none' | AccessLevel;

const LEVEL_LABEL: Record<Level, string> = { none: 'None', own: 'Own', all: 'All' };

/** Roles tab on the Users page: each tenant defines its own roles and what each can use. */
@Component({
  selector: 'app-roles-tab',
  standalone: true,
  imports: [FormsModule, TableModule, ButtonModule, InputTextModule, MessageModule, SelectButtonModule, AppDialogModule, RowActionsMenuComponent],
  template: `
    @if (error()) {
      <div class="card"><p-message severity="error" [text]="error()!" /></div>
    }
    <div class="card">
      <h2 class="page-title page-title-in-card">Roles</h2>
      <p class="text-color-secondary">
        A role decides which parts of the app a user can use. Admins can use everything. For each area, choose
        <strong>None</strong>, <strong>Own</strong> (only their own records, or clients they are assigned to) or <strong>All</strong>.
      </p>
      <div class="toolbar">
        <button pButton label="Add role" icon="pi pi-plus" class="p-button-sm" (click)="openAdd()"></button>
      </div>
      <p-table [value]="roles()" [loading]="loading()" styleClass="table-bordered mt-3">
        <ng-template pTemplate="header">
          <tr><th style="width: 3rem"></th><th>Role</th><th>Can use</th><th style="width: 7rem">Users</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-role>
          <tr>
            <td><app-row-actions-menu [items]="actions(role)" ariaLabel="Role actions" /></td>
            <td>{{ role.name }}</td>
            <td>{{ summary(role) }}</td>
            <td>{{ role.userCount }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="4" class="text-center p-4 text-color-secondary">No roles yet. Add one to give users access.</td></tr>
        </ng-template>
      </p-table>
    </div>

    <p-dialog
      [header]="editing() ? 'Edit role' : 'Add role'"
      [(visible)]="dialogVisible"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!saving()"
      [style]="{ width: 'min(34rem, 96vw)' }"
    >
      <div class="form">
        <label for="role-name">Name</label>
        <input pInputText id="role-name" [(ngModel)]="name" placeholder="Caregiver" class="w-full" />
        <div class="areas">
          @for (area of areas; track area) {
            <div class="area-row">
              <span>{{ label(area) }}</span>
              <p-selectbutton
                [options]="optionsFor(area)"
                optionLabel="label"
                optionValue="value"
                [ngModel]="levels()[area]"
                (ngModelChange)="setLevel(area, $event)"
                [allowEmpty]="false"
                size="small"
                [ariaLabel]="label(area) + ' access'"
              />
            </div>
          }
        </div>
        @if (formError()) { <p-message severity="error" [text]="formError()!" /> }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="dialogVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!name.trim()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 0.5rem; }
    .areas { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
    .area-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  `,
})
export class RolesTabComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  /** Emitted after a role changes so the Users tab can refresh role names. */
  readonly changed = output<void>();

  readonly areas = PERMISSION_AREAS;
  roles = signal<RoleRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  formError = signal<string | null>(null);
  editing = signal<RoleRow | null>(null);
  levels = signal<Record<PermissionArea, Level>>(this.emptyLevels());
  dialogVisible = false;
  name = '';

  ngOnInit() {
    void this.load();
  }

  label(area: PermissionArea) {
    return PERMISSION_LABELS[area];
  }

  optionsFor(area: PermissionArea) {
    const levels: Level[] = OWNABLE_AREAS.includes(area) ? ['none', 'own', 'all'] : ['none', 'all'];
    return levels.map((value) => ({ value, label: LEVEL_LABEL[value] }));
  }

  summary(role: RoleRow): string {
    const parts = PERMISSION_AREAS.filter((a) => role.permissions[a]).map(
      (a) => `${PERMISSION_LABELS[a]}${role.permissions[a] === 'own' ? ' (own)' : ''}`,
    );
    return parts.length ? parts.join(', ') : 'Nothing';
  }

  actions(role: RoleRow): RowActionItem[] {
    return [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(role) },
      { id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(role) },
    ];
  }

  setLevel(area: PermissionArea, level: Level) {
    this.levels.update((l) => ({ ...l, [area]: level }));
  }

  private emptyLevels(): Record<PermissionArea, Level> {
    return Object.fromEntries(PERMISSION_AREAS.map((a) => [a, 'none'])) as Record<PermissionArea, Level>;
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.roles.set(await this.api.get<RoleRow[]>('/roles'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load roles');
    } finally {
      this.loading.set(false);
    }
  }

  openAdd() {
    this.editing.set(null);
    this.name = '';
    this.levels.set(this.emptyLevels());
    this.formError.set(null);
    this.dialogVisible = true;
  }

  openEdit(role: RoleRow) {
    this.editing.set(role);
    this.name = role.name;
    this.levels.set({ ...this.emptyLevels(), ...(role.permissions as Record<PermissionArea, Level>) });
    this.formError.set(null);
    this.dialogVisible = true;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const permissions: RolePermissions = {};
    for (const area of PERMISSION_AREAS) {
      const level = this.levels()[area];
      if (level !== 'none') permissions[area] = level;
    }
    try {
      const body = { name: this.name.trim(), permissions };
      const current = this.editing();
      if (current) await this.api.patch(`/roles/${current.id}`, body);
      else await this.api.post('/roles', body);
      this.dialogVisible = false;
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Role saved.' });
      await this.load();
      this.changed.emit();
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not save role');
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(role: RoleRow) {
    this.deleteConfirm.confirm({
      message: `Delete the role "${role.name}"?`,
      accept: async () => {
        try {
          await this.api.delete(`/roles/${role.id}`);
          await this.load();
          this.changed.emit();
        } catch (e) {
          this.error.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not delete role');
        }
      },
    });
  }
}
