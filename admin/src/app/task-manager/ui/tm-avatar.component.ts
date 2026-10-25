import { Component, computed, input } from '@angular/core';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { avatarPalette, initials } from '../core/tm-format.util';
import { Person } from '../core/tm.types';

/** Round person avatar: photo when available, else colored initials. Empty dashed circle when unassigned. */
@Component({
  selector: 'app-tm-avatar',
  standalone: true,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      vertical-align: middle;
    }
    .tm-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      font-weight: 700;
      letter-spacing: 0.02em;
      object-fit: cover;
      flex-shrink: 0;
      user-select: none;
      line-height: 1;
    }
    .tm-avatar--empty {
      border: 1px dashed color-mix(in srgb, var(--text-color-secondary, #6b7280) 70%, transparent);
      color: var(--text-color-secondary, #6b7280);
      background: transparent;
    }
  `,
  template: `
    @if (person(); as p) {
      @if (photo()) {
        <img class="tm-avatar" [src]="photo()!" alt="" [style.width.px]="size()" [style.height.px]="size()" [attr.title]="showTitle() ? p.name : null" />
      } @else {
        <span
          class="tm-avatar"
          [style.width.px]="size()"
          [style.height.px]="size()"
          [style.font-size.px]="size() * 0.4"
          [style.background]="palette().bg"
          [style.color]="palette().fg"
          [attr.title]="showTitle() ? p.name : null"
          >{{ letters() }}</span
        >
      }
    } @else {
      <span class="tm-avatar tm-avatar--empty" [style.width.px]="size()" [style.height.px]="size()" title="Unassigned">
        <i class="pi pi-user" [style.font-size.px]="size() * 0.45"></i>
      </span>
    }
  `,
})
export class TmAvatarComponent {
  person = input<Person | null | undefined>(null);
  size = input(24);
  showTitle = input(true);

  photo = computed(() => resolveAssetUrl(this.person()?.avatarUrl ?? null));
  letters = computed(() => (this.person() ? initials(this.person()!) : ''));
  palette = computed(() => avatarPalette(this.person()?.id ?? 'x'));
}
