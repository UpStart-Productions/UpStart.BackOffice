import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';

/**
 * Project marker used across Tasks: a white Lucide icon on a rounded square in the project color,
 * or the plain color dot when the project has no icon.
 */
@Component({
  selector: 'app-tm-project-icon',
  standalone: true,
  imports: [LucideIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (icon()) {
      <span class="tm-project-icon" [class.tm-project-icon--lg]="large()" [style.background]="color() || fallback">
        <nmp-lucide-icon [name]="icon()" [size]="large() ? '1.05rem' : '0.75rem'" />
      </span>
    } @else {
      <span class="tm-project-dot" [class.tm-project-dot--lg]="large()" [style.background]="color() || fallback"></span>
    }
  `,
  styles: [`:host { display: inline-flex; align-items: center; flex-shrink: 0; }`],
})
export class TmProjectIconComponent {
  readonly color = input<string | null | undefined>(null);
  readonly icon = input<string | null | undefined>(null);
  readonly large = input(false);
  readonly fallback = '#94a3b8';
}
