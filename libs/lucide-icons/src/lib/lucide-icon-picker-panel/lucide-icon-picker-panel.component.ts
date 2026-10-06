import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { LucideIconComponent } from '../lucide-icon/lucide-icon.component';
import { LucideIconRegistryService } from '../lucide-icon-registry.service';
import type { LucideIconIndexEntry } from '../types';

const GRID_COLUMNS = 6;
const ROW_HEIGHT = 56;

/**
 * Reusable search + icon grid, shared by the standalone picker control (popover) and the Quill
 * insert-icon dialog. Loads the icon index lazily (once, shared across every instance via
 * LucideIconRegistryService) and never renders more than a screenful of icons: results are grouped
 * into rows of GRID_COLUMNS and fed through a CDK virtual-scroll viewport, so a search that matches
 * all ~1,776 icons still only ever has a few dozen real DOM nodes at a time.
 */
@Component({
  selector: 'nmp-lucide-icon-picker-panel',
  standalone: true,
  imports: [CommonModule, ScrollingModule, LucideIconComponent],
  templateUrl: './lucide-icon-picker-panel.component.html',
  styleUrl: './lucide-icon-picker-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LucideIconPickerPanelComponent {
  private readonly registry = inject(LucideIconRegistryService);

  private readonly searchInputRef = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  iconSelected = output<string>();

  readonly rowHeight = ROW_HEIGHT;

  query = signal('');
  loading = signal(true);
  results = signal<LucideIconIndexEntry[]>([]);
  rows = signal<LucideIconIndexEntry[][]>([]);

  constructor() {
    void this.registry.ensureSpriteLoaded();
    void this.runSearch('');
  }

  focusSearch(): void {
    queueMicrotask(() => this.searchInputRef()?.nativeElement.focus());
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    void this.runSearch(value);
  }

  select(name: string): void {
    this.iconSelected.emit(name);
  }

  private async runSearch(query: string): Promise<void> {
    this.loading.set(true);
    const matches = await this.registry.search(query);
    this.results.set(matches);
    this.rows.set(chunk(matches, GRID_COLUMNS));
    this.loading.set(false);
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
