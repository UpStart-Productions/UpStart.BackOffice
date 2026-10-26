import { Component, computed, inject, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { PeoplePickerLoader } from '../../core/people-picker.loader';
import { PeopleDirectoryOption } from '../../pages/projects/people-directory.util';
import { PeopleSelectComponent } from '../../ui/people-select/people-select.component';
import { SessionService } from '../../core/session.service';
import { TmApiService } from '../core/tm-api.service';
import { TmStoreService } from '../core/tm-store.service';
import { MemberRole, ProjectMember, TmProject } from '../core/tm.types';
import { TmAvatarComponent } from './tm-avatar.component';

/**
 * Share dialog: pick someone from the tenant (team + People) or type an email, then Invite.
 * New emails become guests and get an invite link to set their password; existing people are added right away.
 */
@Component({
  selector: 'app-tm-members-dialog',
  standalone: true,
  imports: [
    FormsModule,
    AppDialogModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    MessageModule,
    TmAvatarComponent,
    PeopleSelectComponent,
  ],
  template: `
    <p-dialog [header]="'Share ' + project().name" [(visible)]="visible" [modal]="true" [style]="{ width: '36rem' }" (onShow)="onShow()" [draggable]="false">
      @if (project().permissions.canManage) {
        <form class="tm-share-add-stack" (ngSubmit)="invite()">
          <div class="form-field tm-share-people-picker">
            <label for="tm-share-person">Add existing person</label>
            <app-people-select
              inputId="tm-share-person"
              [(pickId)]="personPickId"
              (pickIdChange)="onPersonPicked($event)"
              [options]="sharePeopleOptions()"
              [loading]="sharePeopleLoading()"
              placeholder="Search and select…"
              ariaLabel="Add existing person"
            />
          </div>
          <span class="tm-share-or-label">Or enter an email address</span>
          <div class="tm-share-add">
            <input
              pInputText
              id="tm-share-email"
              name="email"
              type="email"
              [(ngModel)]="email"
              (ngModelChange)="onEmailTyped()"
              placeholder="Email address"
              autocomplete="off"
              class="flex-1"
              aria-label="Email address to share with"
            />
            <p-select [options]="roleOptions" optionLabel="label" optionValue="value" [(ngModel)]="role" name="role" appendTo="body" aria-label="Role" />
            <button type="submit" pButton label="Invite" [loading]="busy()" [disabled]="!email.trim() || busy()"></button>
          </div>
        </form>
        @if (error()) {
          <p-message severity="error" [text]="error()!" styleClass="mt-2" />
        }
        <p class="tm-share-hint">
          Team members and People in Back Office appear in the list when they have an email. New addresses become guests and get an email to set a password. People whose role has Tasks at All can always see every project.
        </p>
      }

      <ul class="tm-member-list">
        @for (m of project().members; track m.id) {
          <li class="tm-member">
            <app-tm-avatar [person]="m" [size]="32" />
            <div class="tm-member-main">
              <strong>
                {{ m.firstName || m.lastName ? m.name : m.email }}
                @if (m.invitePending) { <span class="tm-chip tm-chip-invited">Invited</span> }
              </strong>
              <span class="tm-muted">
                @if (m.firstName || m.lastName) { {{ m.email }} }
                @if (m.isGuest) { {{ m.firstName || m.lastName ? '·' : '' }} Guest }
                @if (m.invitePending && project().permissions.canManage) {
                  · <button type="button" class="tm-link-btn" (click)="resend(m)" [disabled]="resending() === m.id">
                    {{ resending() === m.id ? 'Sending…' : 'Resend invite' }}
                  </button>
                }
              </span>
            </div>
            @if (project().permissions.canManage) {
              <p-select [options]="roleOptions" optionLabel="label" optionValue="value" [ngModel]="m.memberRole" (ngModelChange)="setRole(m, $event)" appendTo="body" [attr.aria-label]="'Role for ' + m.email" />
              <button type="button" class="tm-icon-btn tm-icon-btn--danger" (click)="remove(m)" [attr.aria-label]="'Remove ' + m.email" title="Remove from project"><i class="pi pi-trash"></i></button>
            } @else {
              <span class="tm-muted">{{ roleLabel(m.memberRole) }}</span>
              @if (m.id === meId()) {
                <button type="button" pButton label="Leave" severity="danger" [text]="true" (click)="remove(m)"></button>
              }
            }
          </li>
        } @empty {
          <li class="tm-muted">Nobody has been added yet — people with Tasks at All can still see this project.</li>
        }
      </ul>

      <div class="form-actions">
        <button type="button" pButton label="Done" severity="secondary" (click)="visible.set(false)"></button>
      </div>
    </p-dialog>
  `,
})
export class TmMembersDialogComponent {
  private readonly api = inject(TmApiService);
  private readonly peoplePicker = inject(PeoplePickerLoader);
  private readonly store = inject(TmStoreService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  visible = model(false);
  project = input.required<TmProject>();
  updated = output<TmProject>();

  busy = signal(false);
  resending = signal<string | null>(null);
  error = signal<string | null>(null);
  sharePeopleLoading = signal(false);
  sharePeopleOptions = signal<PeopleDirectoryOption[]>([]);
  personPickId: string | null = null;
  email = '';
  role: MemberRole = 'EDITOR';
  readonly roleOptions = [
    { label: 'Owner', value: 'OWNER' },
    { label: 'Editor', value: 'EDITOR' },
    { label: 'Commenter', value: 'COMMENTER' },
  ];
  readonly meId = computed(() => this.session.me()?.id);
  onShow() {
    this.email = '';
    this.personPickId = null;
    this.role = 'EDITOR';
    this.error.set(null);
    void this.loadSharePeople();
    setTimeout(() => document.getElementById('tm-share-person')?.focus(), 50);
  }

  onPersonPicked(id: string | null | undefined) {
    if (!id) return;
    const option = this.sharePeopleOptions().find((o) => o.id === id);
    if (option?.email) {
      this.email = option.email;
      this.error.set(null);
    } else {
      this.error.set('That person has no email on file. Add an email on their People profile or type an address below.');
    }
  }

  onEmailTyped() {
    const typed = this.email.trim().toLowerCase();
    const match = this.sharePeopleOptions().find((o) => o.email.trim().toLowerCase() === typed);
    this.personPickId = match?.id ?? null;
  }

  private async loadSharePeople() {
    this.sharePeopleLoading.set(true);
    try {
      this.sharePeopleOptions.set(
        await this.peoplePicker.loadTeamAndCrm({
          tmProjectId: this.project().id,
          excludeEmails: this.project().members.map((m) => m.email),
        }),
      );
    } finally {
      this.sharePeopleLoading.set(false);
    }
  }

  roleLabel(role: MemberRole) {
    return this.roleOptions.find((r) => r.value === role)?.label ?? role;
  }

  private message(err: unknown) {
    return (err instanceof Error ? err.message : String(err)).replace(/^API error \d+: /, '');
  }

  async invite() {
    const email = this.email.trim();
    if (!email) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const res = await this.api.invite(this.project().id, email, this.role);
      this.email = '';
      this.personPickId = null;
      this.store.invalidatePeople(res.project.id);
      this.updated.emit(res.project);
      void this.loadSharePeople();
      this.toast.add({
        severity: 'success',
        summary: res.invited ? 'Invitation sent' : 'Added to project',
        detail: res.invited
          ? res.emailed
            ? `${email} will get an email to set a password.`
            : `${email} was added, but the email could not be sent. Try Resend invite.`
          : `${email} now has access.`,
        life: 4000,
      });
    } catch (err) {
      this.error.set(this.message(err));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(m: ProjectMember) {
    this.resending.set(m.id);
    try {
      const res = await this.api.resendInvite(this.project().id, m.id);
      this.toast.add({
        severity: res.emailed ? 'success' : 'warn',
        summary: res.emailed ? 'Invite re-sent' : 'Email not sent',
        detail: res.emailed ? `A new link was emailed to ${m.email}.` : 'Check the mail settings and try again.',
        life: 4000,
      });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not resend', detail: this.message(err) });
    } finally {
      this.resending.set(null);
    }
  }

  async setRole(m: ProjectMember, role: MemberRole) {
    try {
      this.updated.emit(await this.api.updateMember(this.project().id, m.id, role));
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not change role', detail: this.message(err) });
    }
  }

  async remove(m: ProjectMember) {
    try {
      await this.api.removeMember(this.project().id, m.id);
      this.store.invalidatePeople(this.project().id);
      if (m.id === this.meId() && !this.project().permissions.seesAllProjects) {
        this.visible.set(false);
        await this.store.loadProjects();
        return;
      }
      this.updated.emit(await this.api.getProject(this.project().id));
      void this.loadSharePeople();
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not remove member', detail: this.message(err) });
    }
  }
}
