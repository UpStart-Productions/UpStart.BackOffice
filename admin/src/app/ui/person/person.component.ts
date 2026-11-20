import { Component, computed, inject, input } from '@angular/core';
import { type AvatarSize, avatarHostSizeClass, avatarSizeClasses } from '../../core/avatar-size';
import { PersonDetailService } from '../../core/person-detail.service';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { avatarPalette, initials } from '../../task-manager/core/tm-format.util';

/**
 * A user or contact shown the same way everywhere: round avatar (photo, else colored initials) and name,
 * with an optional second line. A contactId or userId makes the name open the person detail modal. `avatarOnly` shows just the avatar (e.g. next to a page title).
 */
@Component({
  selector: 'app-person',
  standalone: true,
  imports: [],
  host: {
    '[class]': 'hostSizeClass()',
    // `title` is also a global HTML attribute; clear it so the host doesn't show a browser tooltip.
    '[attr.title]': 'null',
  },
  template: `
    <span class="person" [class.person--two-line]="!!subtitle()">
      @if (photo() && !nameOnly()) {
        <img [class]="personAvatarClass()" [src]="photo()!" alt="" />
      } @else if (!nameOnly()) {
        <span
          [class]="personAvatarClass()"
          aria-hidden="true"
          [style.background]="palette().bg"
          [style.color]="palette().fg"
          >{{ letters() }}</span
        >
      }
      @if (!avatarOnly()) {
        <span class="person-text">
          @if (contactId() || userId()) {
            <button type="button" class="person-name person-name-button" (click)="openDetail($event)">{{ label() }}</button>
          } @else {
            <span class="person-name">{{ label() }}</span>
          }
          @if (subtitle()) {
            <span class="person-sub">{{ subtitle() }}</span>
          }
        </span>
      }
    </span>
  `,
  styles: `
    :host { display: inline-flex; min-width: 0; max-width: 100%; vertical-align: middle; }
    .person { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .person-avatar {
      font-weight: 600;
    }
    .person-text { display: flex; flex-direction: column; min-width: 0; }
    .person-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .person-name-button { border: 0; background: none; padding: 0; font: inherit; text-align: left; cursor: pointer; color: var(--color-text-link); }
    .person-name-button:hover { color: var(--color-text-link-hover); text-decoration: underline; }
    .person-sub { font-size: var(--fs-sm); color: var(--text-color-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `,
})
export class PersonComponent {
  /** Display name; falls back to first/last, then email. */
  name = input<string | null | undefined>(null);
  firstName = input<string | null | undefined>(null);
  lastName = input<string | null | undefined>(null);
  email = input<string | null | undefined>(null);
  avatarUrl = input<string | null | undefined>(null);
  /** Stable id for the initials color (user or contact id). */
  personId = input<string | null | undefined>(null);
  size = input<AvatarSize>('med');
  readonly personAvatarClass = computed(() => `person-avatar ${avatarSizeClasses(this.size())}`);
  readonly hostSizeClass = computed(() => avatarHostSizeClass(this.size()));
  subtitle = input<string | null | undefined>(null);
  /** A contact: the name opens the person detail modal for them. */
  contactId = input<string | null | undefined>(null);
  /** A user (team member): the name opens the person detail modal with what's shown here. */
  userId = input<string | null | undefined>(null);
  avatarOnly = input(false);
  /** Just the name (its avatar is shown elsewhere, e.g. a record card's leading avatar). */
  nameOnly = input(false);

  readonly label = computed(
    () => this.name()?.trim() || [this.firstName(), this.lastName()].filter(Boolean).join(' ').trim() || this.email() || 'Unknown',
  );
  readonly photo = computed(() => resolveAssetUrl(this.avatarUrl() ?? null));
  readonly letters = computed(() =>
    initials({ firstName: this.firstName() ?? null, lastName: this.lastName() ?? null, name: this.label(), email: this.email() ?? '' }),
  );
  readonly palette = computed(() => avatarPalette(this.personId() || this.label()));

  private readonly detail = inject(PersonDetailService);

  openDetail(event: Event) {
    event.stopPropagation();
    const contactId = this.contactId();
    if (contactId) {
      this.detail.open({ kind: 'contact', id: contactId });
      return;
    }
    const userId = this.userId();
    if (userId) this.detail.open({ kind: 'user', id: userId, name: this.label(), email: this.email(), avatarUrl: this.avatarUrl() });
  }
}
