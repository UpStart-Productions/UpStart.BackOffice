import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContactSummary, contactName } from '../../core/communications.api';
import { Person } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { CopyEmailComponent } from '../copy-email/copy-email.component';

/**
 * The standard person display: large avatar, name (link), title or role, copyable email.
 * Used by the People panel and the Activity person panel so a person looks the same everywhere.
 * Project tags/badges into [nameExtras] and row buttons into [rowActions].
 */
@Component({
  selector: 'app-person-row',
  standalone: true,
  imports: [RouterLink, TmAvatarComponent, CopyEmailComponent],
  template: `
    <div class="person-row">
      <app-tm-avatar [person]="avatarPerson()" size="lg" [showTitle]="false" />
      <div class="person-row-main">
        <div class="person-row-name-line">
          @if (link()) {
            <a class="person-row-name" [routerLink]="['/people', contact().id]">{{ name() }}</a>
          } @else {
            <button type="button" class="person-row-name" (click)="nameClick.emit(contact().id)">{{ name() }}</button>
          }
          <ng-content select="[nameExtras]" />
          <ng-content select="[rowActions]" />
        </div>
        @if (meta(); as m) {
          <span class="person-row-meta">{{ m }}</span>
        }
        <app-copy-email [email]="contact().emails[0]?.email" [muted]="true" [block]="true" />
      </div>
    </div>
  `,
  styles: `
    .person-row { display: flex; align-items: center; gap: 0.65rem; padding: 0.6rem 0; }
    .person-row-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 0.2rem; }
    .person-row-name-line { display: flex; flex-wrap: wrap; align-items: center; gap: 0.35rem 0.5rem; min-width: 0; width: 100%; }
    .person-row-name {
      border: 0; background: none; padding: 0; font: inherit; font-weight: 600; line-height: 1.25;
      color: var(--color-text-link); cursor: pointer; text-align: left; text-decoration: none;
    }
    .person-row-name:hover { color: var(--color-text-link-hover); text-decoration: underline; }
    .person-row-meta { font-size: var(--fs-sm); color: var(--text-color-secondary); }
  `,
})
export class PersonRowComponent {
  contact = input.required<ContactSummary>();
  /** Role at an organization; falls back to the person's title. */
  role = input<string | null>(null);
  /** true: the name links to the person page. false: the name emits nameClick (e.g. open a detail modal). */
  link = input(true);
  nameClick = output<string>();

  readonly name = computed(() => contactName(this.contact()));
  readonly meta = computed(() => this.role() || this.contact().title || null);
  readonly avatarPerson = computed<Person>(() => {
    const c = this.contact();
    const name = contactName(c);
    return {
      id: c.id,
      name,
      email: c.emails[0]?.email || name,
      firstName: c.firstName || null,
      lastName: c.lastName ?? null,
      avatarUrl: c.avatarUrl ?? null,
      role: 'USER',
      isGuest: false,
    };
  });
}
