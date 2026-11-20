import { Component, computed, inject, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { PersonDetailService } from '../../core/person-detail.service';
import { Person } from '../../task-manager/core/tm.types';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { RecordCardBadge, RecordCardComponent } from './record-card.component';

export type PersonCardData = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  /** Job title, shown in caps under the name. */
  title?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  emails?: { email: string; isPrimary?: boolean }[];
  email?: string | null;
  isGuest?: boolean;
};

export type PersonCardTag = {
  label: string;
  severity?: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
};

/**
 * THE person display: one row for anyone (a contact in People, a user, a team member). Avatar, name, an optional
 * subtitle (their role here), job title in caps, and email (copyable) or phone. Clicking the name opens the person
 * detail modal (a contact from People, a user from what's shown); clickable makes it emit titleClick instead (a filter list).
 * Never build another person widget: extend this one with an input.
 */
@Component({
  selector: 'app-person-card',
  standalone: true,
  host: { class: 'record-card-host person-card' },
  imports: [RecordCardComponent, CopyEmailComponent, TagModule],
  template: `
    <app-record-card
      [person]="avatar()"
      [title]="displayName()"
      [clickable]="true"
      [selected]="selected()"
      (titleClick)="onName()"
      [subtitle]="subtitle()"
      [badges]="badges()"
    >
      <ng-content select="[recordActions]" ngProjectAs="[recordActions]" />
      <div recordBody class="person-card-body">
        @if (hint()) {
          <p class="person-card-hint">{{ hint() }}</p>
        }
        <div class="person-card-footer">
          <div class="person-card-lines">
            @if (jobTitleText(); as t) {
              <span class="person-card-job">{{ t }}</span>
            }
            @if (emailText(); as e) {
              <app-copy-email [email]="e" [muted]="true" [block]="true" />
            } @else if (phoneText(); as ph) {
              <span class="person-card-meta">{{ ph }}</span>
            }
          </div>
          @if (footerTags().length) {
            <div class="person-card-tags">
              @for (tag of footerTags(); track tag.label) {
                <p-tag [value]="tag.label" [severity]="tag.severity ?? 'secondary'" />
              }
            </div>
          }
        </div>
      </div>
    </app-record-card>
  `,
  styles: `
    .person-card-hint {
      margin: 0 0 0.15rem;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
      line-height: 1.35;
    }
    .person-card-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.5rem;
      min-width: 0;
      width: 100%;
    }
    .person-card-lines {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
      flex: 1 1 auto;
    }
    .person-card-job {
      font-size: var(--fs-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      line-height: 1.35;
    }
    .person-card-meta {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
    }
    .person-card-tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.35rem;
      flex-shrink: 0;
      margin-left: auto;
    }
  `,
})
export class PersonCardComponent {
  private readonly detail = inject(PersonDetailService);

  person = input.required<PersonCardData>();
  /** contact: a People record. user: a user or team member. Decides what the detail modal shows. */
  kind = input<'contact' | 'user'>('contact');
  /** Name to show instead of the person's own (e.g. a project contact's display name). */
  name = input<string | null>(null);
  /** A line under the name: their role here (e.g. at this account). */
  subtitle = input<string | null>(null);
  /** Job title (caps); default: the person's title. */
  jobTitle = input<string | null | undefined>(undefined);
  /** Email; default: the person's primary email. */
  email = input<string | null | undefined>(undefined);
  /** Phone (shown when there's no email); default: the person's phone. */
  phone = input<string | null | undefined>(undefined);
  hint = input<string | null>(null);
  badges = input<RecordCardBadge[]>([]);
  footerTags = input<PersonCardTag[]>([]);
  /** The name emits titleClick (e.g. pick a filter) instead of opening the detail modal. */
  clickable = input(false);
  /** Highlighted (picked in a filter list). */
  selected = input(false);
  titleClick = output<void>();

  readonly emailText = computed(() => {
    const override = this.email();
    if (override !== undefined) return override?.trim() || null;
    const p = this.person();
    return p.emails?.find((e) => e.isPrimary)?.email ?? p.emails?.[0]?.email ?? p.email ?? null;
  });
  readonly phoneText = computed(() => {
    const override = this.phone();
    return (override !== undefined ? override : this.person().phone)?.trim() || null;
  });
  readonly jobTitleText = computed(() => {
    const override = this.jobTitle();
    return (override !== undefined ? override : this.person().title)?.trim() || null;
  });
  readonly displayName = computed(() => {
    const p = this.person();
    return this.name()?.trim() || [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name?.trim() || this.emailText() || 'Person';
  });
  onName() {
    if (this.clickable()) {
      this.titleClick.emit();
      return;
    }
    const p = this.person();
    if (this.kind() === 'contact') this.detail.open({ kind: 'contact', id: p.id });
    else this.detail.open({ kind: 'user', id: p.id, name: this.displayName(), email: this.emailText(), phone: this.phoneText(), avatarUrl: p.avatarUrl, title: this.jobTitleText() });
  }

  readonly avatar = computed<Person>(() => {
    const p = this.person();
    return {
      id: p.id,
      name: this.displayName(),
      email: this.emailText() || this.displayName(),
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      avatarUrl: p.avatarUrl ?? null,
      role: 'USER',
      isGuest: !!p.isGuest,
    };
  });
}
