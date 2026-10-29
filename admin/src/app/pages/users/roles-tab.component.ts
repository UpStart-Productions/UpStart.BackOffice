import { Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { CheckboxModule } from 'primeng/checkbox';
import { TooltipModule } from 'primeng/tooltip';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { TableModule } from 'primeng/table';
import { MessageService } from 'primeng/api';
import {
  ACTION_LABELS,
  actionsFor,
  areaEnabled,
  OWNABLE_AREAS,
  PERMISSION_AREAS,
  PERMISSION_LABELS,
  ROLE_ACTIONS,
  type AccessLevel,
  type AreaActions,
  type PermissionArea,
  type RoleAction,
  type RoleActions,
  type RolePermissions,
} from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { PersonComponent } from '../../ui/person/person.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

type RoleRow = {
  id: string;
  name: string;
  key: string | null;
  isPreset: boolean;
  isModified: boolean;
  permissions: RolePermissions;
  actions: RoleActions;
  userCount: number;
};
type RoleUser = { id: string; email: string; firstName: string | null; lastName: string | null; name: string | null; avatarUrl: string | null; isActive: boolean };
const ACTION_ICONS: Record<RoleAction, string> = {
  create: 'pi-plus',
  edit: 'pi-pencil',
  delete: 'pi-trash',
  setup: 'pi-cog',
};
type ActionGrid = Record<PermissionArea, Record<RoleAction, boolean>>;
type Level = 'none' | AccessLevel;

const LEVEL_LABEL: Record<Level, string> = { none: 'None', own: 'Own', all: 'All' };

/** Roles tab on the Users page: each tenant defines its own roles and what each can use. */
@Component({
  selector: 'app-roles-tab',
  standalone: true,
  imports: [HelpTextComponent, PersonComponent, FormsModule, TableModule, ButtonModule, InputTextModule, MessageModule, SelectButtonModule, CheckboxModule, TooltipModule, LucideIconComponent, AppDialogModule, RowActionsMenuComponent],
  template: `
    @if (error()) {
      <p-message severity="error" [text]="error()!" styleClass="mb-3" />
    }
    <div>
      <div class="legend" aria-hidden="true">
        @for (a of allActions; track a) {
          <span><i [class]="'pi ' + actionIcon(a)"></i> {{ actionLabel(a) }}</span>
        }
        <span><i class="pi pi-plus off"></i> Faded: not allowed</span>
        <span><span class="cap-own">Own</span> Only their own records</span>
      </div>
      <p-table [value]="roles()" [loading]="loading()" styleClass="table-bordered mt-2">
        <ng-template pTemplate="header">
          <tr><th style="width: 3rem"></th><th class="role-col">Role</th><th>Can use</th></tr>
        </ng-template>
        <ng-template pTemplate="body" let-role>
          <tr>
            <td><app-row-actions-menu [items]="actions(role)" ariaLabel="Role actions" /></td>
            <td class="role-col">
              {{ role.name }}
              @if (role.isPreset) {
                <span
                  class="preset-icon"
                  tabindex="0"
                  pTooltip="Built-in role. Every organization starts with it. You can edit it, and reset it to the default if it's been changed. It can't be deleted."
                  tooltipPosition="top"
                  aria-label="Built-in role"
                >
                  <nmp-lucide-icon name="package-open" size="1.05rem" />
                </span>
              }
            </td>
            <td>
              @if (chips(role).length) {
                <div class="caps">
                  @for (c of chips(role); track c.area) {
                    <span class="cap" tabindex="0" [pTooltip]="c.tip" tooltipPosition="top" [attr.aria-label]="c.tip">
                      <span class="cap-area">{{ c.label }}</span>
                      @if (c.own) { <span class="cap-own">Own</span> }
                      @for (a of c.actions; track a.key) {
                        <i [class]="'pi ' + a.icon + (a.on ? '' : ' off')" aria-hidden="true"></i>
                      }
                    </span>
                  }
                </div>
              } @else {
                <span class="text-color-secondary">Nothing</span>
              }
            </td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr><td colspan="3" class="text-center p-4 text-color-secondary">No roles yet. Add one to give users access.</td></tr>
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
      [style]="{ width: 'min(52rem, 96vw)' }"
    >
      <div class="form">
        <label for="role-name">Name</label>
        <input pInputText id="role-name" [(ngModel)]="name" placeholder="Caregiver" class="w-full" />
        <table class="grid">
          <thead>
            <tr>
              <th>Area</th>
              <th>View <app-help-text key="roles.view" /></th>
              @for (a of allActions; track a) { <th class="check">{{ actionLabel(a) }}</th> }
            </tr>
          </thead>
          <tbody>
            @for (area of visibleAreas(); track area) {
              <tr>
                <td>{{ label(area) }}</td>
                <td>
                  <p-selectbutton
                    [options]="optionsFor(area)"
                    optionLabel="label"
                    optionValue="value"
                    [ngModel]="levels()[area]"
                    (ngModelChange)="setLevel(area, $event)"
                    [allowEmpty]="false"
                    size="small"
                    [ariaLabel]="label(area) + ' view'"
                  />
                </td>
                @for (a of allActions; track a) {
                  <td class="check">
                    @if (hasAction(area, a)) {
                      <p-checkbox
                        [binary]="true"
                        [ngModel]="grid()[area][a]"
                        (ngModelChange)="setAction(area, a, $event)"
                        [disabled]="levels()[area] === 'none'"
                        [ariaLabel]="label(area) + ' ' + actionLabel(a)"
                      />
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        @if (formError()) { <p-message severity="error" [text]="formError()!" /> }
      </div>
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="dialogVisible = false" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" [disabled]="!name.trim()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

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
              <app-person
                [name]="u.name"
                [firstName]="u.firstName"
                [lastName]="u.lastName"
                [email]="u.email"
                [avatarUrl]="u.avatarUrl"
                [personId]="u.id"
                [subtitle]="u.email + (u.isActive ? '' : ' (disabled)')"
                [size]="36"
              />
            </li>
          }
        </ul>
      }
    </p-dialog>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 0.5rem; }
    .grid { width: 100%; border-collapse: collapse; margin-top: 0.75rem; }
    .grid th { text-align: left; font-size: var(--fs-sm); color: var(--text-color-secondary); font-weight: 600; padding: 0.25rem 0.5rem; }
    .grid td { padding: 0.375rem 0.5rem; border-top: 1px solid var(--surface-border); }
    .grid .check { text-align: center; width: 4.5rem; }
    .preset-icon { display: inline-flex; vertical-align: middle; margin-left: 0.5rem; color: var(--p-amber-500, #f59e0b); cursor: help; }
    .role-col { width: 14rem; white-space: nowrap; }
    .caps { display: flex; flex-wrap: wrap; gap: 0.375rem; }
    .cap { cursor: help; display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.2rem 0.5rem; border: 1px solid var(--surface-border); border-radius: 6px; font-size: var(--fs-xs); white-space: nowrap; }
    .cap-area { font-weight: 600; margin-right: 0.125rem; }
    .cap-own { font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.02em; padding: 0 0.3rem; border-radius: 4px; background: var(--surface-ground); color: var(--text-color-secondary); }
    .cap .pi, .legend .pi { font-size: var(--fs-xs); color: var(--text-color); }
    .pi.off { opacity: 0.2; }
    .legend { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 0.75rem; font-size: var(--fs-sm); color: var(--text-color-secondary); }
    .legend > span { display: inline-flex; align-items: center; gap: 0.375rem; }
    .role-users { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .role-users li { display: flex; align-items: center; gap: 0.75rem; }
    .role-users li.inactive { opacity: 0.6; }
  `,
})
export class RolesTabComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  /** Emitted after a role changes so the Users tab can refresh role names. */
  readonly changed = output<void>();

  private readonly session = inject(SessionService);
  /** Areas that exist for this tenant (areas of modules that are off are hidden; saved levels are kept). */
  readonly visibleAreas = computed(() => PERMISSION_AREAS.filter((a) => areaEnabled(this.session.me()?.modules, a)));
  readonly allActions = ROLE_ACTIONS;
  /** Checkbox state per area; areas without an action just ignore it. */
  grid = signal<ActionGrid>(this.fullGrid());
  roles = signal<RoleRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  formError = signal<string | null>(null);
  editing = signal<RoleRow | null>(null);
  levels = signal<Record<PermissionArea, Level>>(this.emptyLevels());
  dialogVisible = false;
  name = '';
  /** "View users" modal. */
  usersRole = signal<RoleRow | null>(null);
  roleUsers = signal<RoleUser[]>([]);
  usersLoading = signal(false);
  usersError = signal<string | null>(null);

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

  actionLabel(a: RoleAction) {
    return ACTION_LABELS[a];
  }

  hasAction(area: PermissionArea, a: RoleAction) {
    return actionsFor(area).includes(a);
  }

  actionIcon(a: RoleAction): string {
    return ACTION_ICONS[a];
  }

  /** e.g. "Pipeline, all records: can view, create and edit. Can't delete or change setup." */
  private describe(label: string, own: boolean, actions: { key: RoleAction; on: boolean }[]): string {
    const verb: Record<RoleAction, string> = { create: 'create', edit: 'edit', delete: 'delete', setup: 'change setup' };
    const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
    const can = ['view', ...actions.filter((a) => a.on).map((a) => verb[a.key])];
    const cannot = actions.filter((a) => !a.on).map((a) => verb[a.key]);
    const scope = own ? 'only their own records' : 'all records';
    return `${label}, ${scope}: can ${list(can)}.${cannot.length ? ` Can't ${list(cannot).replace(' and ', ' or ')}.` : ''}`;
  }

  /** One chip per area the role can use: name, Own marker, and an icon per action (faded when not allowed). */
  chips(role: RoleRow) {
    return this.visibleAreas().filter((area) => role.permissions[area]).map((area) => {
      const actions = actionsFor(area).map((a) => ({
        key: a,
        label: ACTION_LABELS[a],
        icon: ACTION_ICONS[a],
        on: role.actions?.[area]?.[a] !== false,
      }));
      const own = role.permissions[area] === 'own';
      return { area, label: PERMISSION_LABELS[area], own, actions, tip: this.describe(PERMISSION_LABELS[area], own, actions) };
    });
  }

  actions(role: RoleRow): RowActionItem[] {
    const items: RowActionItem[] = [
      { id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(role) },
      {
        id: 'users',
        label: role.userCount ? `View ${role.userCount} user${role.userCount === 1 ? '' : 's'}` : 'No users yet',
        icon: 'pi pi-users',
        disabled: !role.userCount,
        command: () => this.openUsers(role),
      },
    ];
    if (role.isPreset) {
      // Only offered once a built-in role has been changed from the default.
      if (role.isModified) {
        items.push({ id: 'reset', label: 'Reset to default', icon: 'pi pi-replay', command: () => this.confirmReset(role) });
      }
    } else {
      items.push({ id: 'delete', label: 'Delete', icon: 'pi pi-trash', severity: 'danger', command: () => this.confirmDelete(role) });
    }
    return items;
  }

  setLevel(area: PermissionArea, level: Level) {
    const wasNone = this.levels()[area] === 'none';
    this.levels.update((l) => ({ ...l, [area]: level }));
    // Turning an area on starts with every action allowed; untick what they shouldn't do.
    if (wasNone && level !== 'none') {
      this.grid.update((g) => ({ ...g, [area]: { create: true, edit: true, delete: true, setup: true } }));
    }
  }

  setAction(area: PermissionArea, action: RoleAction, value: boolean) {
    this.grid.update((g) => ({ ...g, [area]: { ...g[area], [action]: value } }));
  }

  private fullGrid(actions: RoleActions = {}): ActionGrid {
    return Object.fromEntries(
      PERMISSION_AREAS.map((area) => [
        area,
        Object.fromEntries(ROLE_ACTIONS.map((a) => [a, actions[area]?.[a] !== false])) as Record<RoleAction, boolean>,
      ]),
    ) as ActionGrid;
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
    this.grid.set(this.fullGrid());
    this.formError.set(null);
    this.dialogVisible = true;
  }

  openEdit(role: RoleRow) {
    this.editing.set(role);
    this.name = role.name;
    this.levels.set({ ...this.emptyLevels(), ...(role.permissions as Record<PermissionArea, Level>) });
    this.grid.set(this.fullGrid(role.actions));
    this.formError.set(null);
    this.dialogVisible = true;
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    const permissions: RolePermissions = {};
    const actions: RoleActions = {};
    for (const area of PERMISSION_AREAS) {
      const level = this.levels()[area];
      if (level === 'none') continue;
      permissions[area] = level;
      const acts = actionsFor(area);
      if (acts.length) {
        actions[area] = Object.fromEntries(acts.map((a) => [a, this.grid()[area][a]])) as AreaActions;
      }
    }
    try {
      const body = { name: this.name.trim(), permissions, actions };
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

  async openUsers(role: RoleRow) {
    this.usersRole.set(role);
    this.roleUsers.set([]);
    this.usersError.set(null);
    this.usersLoading.set(true);
    try {
      this.roleUsers.set(await this.api.get<RoleUser[]>(`/roles/${role.id}/users`));
    } catch (e) {
      this.usersError.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not load users');
    } finally {
      this.usersLoading.set(false);
    }
  }

  confirmReset(role: RoleRow) {
    this.deleteConfirm.confirm({
      header: 'Reset role',
      message: `Put "${role.name}" back to how every organization starts? Your changes to it are replaced.`,
      accept: async () => {
        try {
          await this.api.post(`/roles/${role.id}/reset`, {});
          this.toast.add({ severity: 'success', summary: 'Reset', detail: `"${role.name}" is back to the default.` });
          await this.load();
          this.changed.emit();
        } catch (e) {
          this.error.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not reset role');
        }
      },
    });
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
