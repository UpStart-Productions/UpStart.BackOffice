import { Component, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { Person } from '../../task-manager/core/tm.types';

/**
 * Two-line picker row: avatar (or record icon), bold title, muted secondary line underneath.
 * Use inside every picker list. Styles: assets/layout/_pick-row.scss.
 * Pass `icon` (a PrimeIcons class) for records; otherwise the avatar for `person` is shown
 * (null person = the empty "unassigned" circle).
 */
@Component({
  selector: 'app-pick-row',
  standalone: true,
  imports: [TagModule, TmAvatarComponent],
  host: { style: 'display: block; min-width: 0; flex: 1 1 auto;' },
  template: `
    <span class="pick-row">
      <span class="pick-row__lead">
        @if (icon()) {
          <i [class]="'pick-row__icon pi ' + icon()" aria-hidden="true"></i>
        } @else {
          <app-tm-avatar [person]="person()" size="med" [showTitle]="false" />
        }
      </span>
      <span class="pick-row__text">
        <span class="pick-row__title-line">
          <span class="pick-row__title">{{ title() }}</span>
          @if (tag()) {
            <p-tag [value]="tag()!" severity="secondary" />
          }
        </span>
        <span class="pick-row__sub">{{ subtitle() }}</span>
      </span>
    </span>
  `,
})
export class PickRowComponent {
  title = input.required<string>();
  subtitle = input('');
  person = input<Person | null | undefined>(null);
  /** PrimeIcons class for record rows (e.g. `pi-folder`). Overrides the avatar. */
  icon = input<string | null>(null);
  /** Small label beside the title (e.g. "Guest"). */
  tag = input<string | null>(null);
}
