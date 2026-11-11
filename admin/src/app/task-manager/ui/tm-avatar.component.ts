import { Component, computed, input } from '@angular/core';
import { type AvatarSize, avatarHostSizeClass, avatarSizeClasses } from '../../core/avatar-size';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { avatarPalette, initials } from '../core/tm-format.util';
import { Person } from '../core/tm.types';

/** Round person avatar: photo when available, else colored initials. Empty dashed circle when unassigned. */
@Component({
  selector: 'app-tm-avatar',
  standalone: true,
  host: {
    '[class]': 'hostSizeClass()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;
      vertical-align: middle;
    }
    .tm-avatar {
      user-select: none;
    }
  `,
  template: `
    @if (person(); as p) {
      @if (photo()) {
        <img [class]="tmAvatarClass()" [src]="photo()!" alt="" [attr.title]="showTitle() ? p.name : null" />
      } @else {
        <span
          [class]="tmAvatarClass()"
          [style.background]="palette().bg"
          [style.color]="palette().fg"
          [attr.title]="showTitle() ? p.name : null"
          >{{ letters() }}</span
        >
      }
    } @else {
      <span [class]="tmAvatarEmptyClass()" title="Unassigned">
        <i class="pi pi-user"></i>
      </span>
    }
  `,
})
export class TmAvatarComponent {
  person = input<Person | null | undefined>(null);
  size = input<AvatarSize>('med');
  readonly tmAvatarClass = computed(() => `tm-avatar ${avatarSizeClasses(this.size())}`);
  readonly tmAvatarEmptyClass = computed(
    () => `tm-avatar ubo-avatar--empty ${avatarSizeClasses(this.size())}`,
  );
  readonly hostSizeClass = computed(() => avatarHostSizeClass(this.size()));
  showTitle = input(true);

  photo = computed(() => resolveAssetUrl(this.person()?.avatarUrl ?? null));
  letters = computed(() => (this.person() ? initials(this.person()!) : ''));
  palette = computed(() => avatarPalette(this.person()?.id ?? 'x'));
}
