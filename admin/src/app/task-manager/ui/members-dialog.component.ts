import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../core/tm-api.service';
import { TmStoreService } from '../core/tm-store.service';
import { MemberRole, Person, ProjectMember, TmProject } from '../core/tm.types';
import { TmAvatarComponent } from './tm-avatar.component';

/** Share dialog: list members, change roles, add staff or guests. Guest invitations (new accounts) come in Stage 6. */
@Component({
  selector: 'app-tm-members-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, SelectModule, TmAvatarComponent],
  template: `
    <p-dialog [header]="'Share ' + project().name" [(visible)]="visible" [modal]="true" [style]="{ width: '34rem' }" (onShow)="onShow()" [draggable]="false">
      @if (project().permissions.canManage) {
        <div class="tm-share-add">
          <p-select
            [options]="candidates()"
            optionLabel="name"
            optionValue="id"
            [(ngModel)]="addUserId"
            [filter]="true"
            filterBy="name,email"
            placeholder="Add a person by name or email"
            appendTo="body"
            styleClass="flex-1"
          >
            <ng-template let-p #item>
              <div class="flex align-items-center gap-2">
                <app-tm-avatar [person]="p" [size]="22" [showTitle]="false" />
                <span>{{ p.name }}</span>
                <span class="tm-muted">{{ p.role === 'GUEST' ? 'Guest' : p.email }}</span>
              </div>
            </ng-template>
          </p-select>
          <p-select [options]="roleOptions" optionLabel="label" optionValue="value" [(ngModel)]="addRole" appendTo="body" />
          <p-button label="Add" (onClick)="add()" [disabled]="!addUserId" [loading]="busy()" />
        </div>
        <p class="tm-share-hint">Staff can always see every project. Guests only see projects they're added to.</p>
      }
      <ul class="tm-member-list">
        @for (m of project().members; track m.id) {
          <li class="tm-member">
            <app-tm-avatar [person]="m" [size]="32" />
            <div class="tm-member-main">
              <strong>{{ m.name }}</strong>
              <span class="tm-muted">{{ m.email }}@if (m.role === 'GUEST') { · Guest }</span>
            </div>
            @if (project().permissions.canManage) {
              <p-select [options]="roleOptions" optionLabel="label" optionValue="value" [ngModel]="m.memberRole" (ngModelChange)="setRole(m, $event)" appendTo="body" />
              <button type="button" class="tm-icon-btn" (click)="remove(m)" [attr.aria-label]="'Remove ' + m.name"><i class="pi pi-times"></i></button>
            } @else {
              <span class="tm-muted">{{ roleLabel(m.memberRole) }}</span>
              @if (m.id === meId()) {
                <p-button label="Leave" size="small" [text]="true" severity="danger" (onClick)="remove(m)" />
              }
            }
          </li>
        } @empty {
          <li class="tm-muted">No explicit members — staff can still see this project.</li>
        }
      </ul>
    </p-dialog>
  `,
})
export class TmMembersDialogComponent {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  visible = model(false);
  project = input.required<TmProject>();
  updated = output<TmProject>();

  everyone = signal<Person[]>([]);
  busy = signal(false);
  addUserId: string | null = null;
  addRole: MemberRole = 'EDITOR';
  readonly roleOptions = [
    { label: 'Owner', value: 'OWNER' },
    { label: 'Editor', value: 'EDITOR' },
    { label: 'Commenter', value: 'COMMENTER' },
  ];
  readonly meId = computed(() => this.session.me()?.id);
  readonly candidates = computed(() => {
    const ids = new Set(this.project().members.map((m) => m.id));
    return this.everyone().filter((p) => !ids.has(p.id));
  });

  async onShow() {
    this.addUserId = null;
    if (this.project().permissions.canManage) {
      try {
        this.everyone.set(await this.api.people());
      } catch {
        /* ignore */
      }
    }
  }

  roleLabel(role: MemberRole) {
    return this.roleOptions.find((r) => r.value === role)?.label ?? role;
  }

  async add() {
    if (!this.addUserId) return;
    this.busy.set(true);
    try {
      const project = await this.api.addMember(this.project().id, this.addUserId, this.addRole);
      this.addUserId = null;
      this.store.invalidatePeople(project.id);
      this.updated.emit(project);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not add member', detail: err instanceof Error ? err.message : String(err) });
    } finally {
      this.busy.set(false);
    }
  }

  async setRole(m: ProjectMember, role: MemberRole) {
    try {
      this.updated.emit(await this.api.updateMember(this.project().id, m.id, role));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not change role', detail: err instanceof Error ? err.message : String(err) });
    }
  }

  async remove(m: ProjectMember) {
    try {
      await this.api.removeMember(this.project().id, m.id);
      this.store.invalidatePeople(this.project().id);
      if (m.id === this.meId() && !this.project().permissions.isStaff) {
        this.visible.set(false);
        await this.store.loadProjects();
        return;
      }
      this.updated.emit(await this.api.getProject(this.project().id));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not remove member', detail: err instanceof Error ? err.message : String(err) });
    }
  }
}
