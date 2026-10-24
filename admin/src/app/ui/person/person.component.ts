import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { avatarPalette, initials } from '../../task-manager/core/tm-format.util';

/**
 * A user or contact shown the same way everywhere: round avatar (photo, else colored initials) and name,
 * with an optional second line and link. `avatarOnly` shows just the avatar (e.g. next to a page title).
 */
@Component({
  selector: 'app-person',
  standalone: true,
  imports: [RouterLink],
  template: `
    <span class="person" [class.person--two-line]="!!subtitle()">
      @if (photo()) {
        <img class="person-avatar" [src]="photo()!" alt="" [style.width.px]="size()" [style.height.px]="size()" />
      } @else {
        <span
          class="person-avatar"
          aria-hidden="true"
          [style.width.px]="size()"
          [style.height.px]="size()"
          [style.font-size.px]="size() * 0.4"
          [style.background]="palette().bg"
          [style.color]="palette().fg"
          >{{ letters() }}</span
        >
      }
      @if (!avatarOnly()) {
        <span class="person-text">
          @if (link(); as l) {
            <a [routerLink]="l" class="text-primary person-name" (click)="$event.stopPropagation()">{{ label() }}</a>
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
      flex-shrink: 0;
      border-radius: 50%;
      object-fit: cover;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 600;
      line-height: 1;
    }
    .person-text { display: flex; flex-direction: column; min-width: 0; }
    .person-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  size = input(24);
  subtitle = input<string | null | undefined>(null);
  link = input<unknown[] | string | null | undefined>(null);
  avatarOnly = input(false);

  readonly label = computed(
    () => this.name()?.trim() || [this.firstName(), this.lastName()].filter(Boolean).join(' ').trim() || this.email() || 'Unknown',
  );
  readonly photo = computed(() => resolveAssetUrl(this.avatarUrl() ?? null));
  readonly letters = computed(() =>
    initials({ firstName: this.firstName() ?? null, lastName: this.lastName() ?? null, name: this.label(), email: this.email() ?? '' }),
  );
  readonly palette = computed(() => avatarPalette(this.personId() || this.label()));
}
