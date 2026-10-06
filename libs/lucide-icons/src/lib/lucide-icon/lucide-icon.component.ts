import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LucideIconRegistryService } from '../lucide-icon-registry.service';

/**
 * Renders one Lucide icon by name via the shared sprite (`<use href="#name">`). No per-icon import —
 * any of the ~1,776 generated icon names works here without a code change. Sizes to `1em` by default
 * so it inherits the surrounding text's font size; color comes from `currentColor` (Lucide's default
 * stroke), so it inherits text/theme color too.
 */
@Component({
  selector: 'nmp-lucide-icon',
  standalone: true,
  templateUrl: './lucide-icon.component.html',
  styleUrl: './lucide-icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LucideIconComponent {
  private readonly registry = inject(LucideIconRegistryService);

  /** Lucide icon name, e.g. "house", "hand-helping". Falls back to a neutral placeholder when empty. */
  name = input<string | null | undefined>(null);
  /** Any valid CSS width/height value. Defaults to "1em". */
  size = input('1em');

  constructor() {
    void this.registry.ensureSpriteLoaded();
  }
}
