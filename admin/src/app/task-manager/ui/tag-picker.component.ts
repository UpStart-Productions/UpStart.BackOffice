import { Component, computed, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Popover, PopoverModule } from 'primeng/popover';
import { chipColors } from '../core/tm-format.util';
import { TmStoreService } from '../core/tm-store.service';
import { TmTag } from '../core/tm.types';

export type TagPick = { tagId: string } | { name: string };

/** Popover to add a tag: search existing tags, or create one by typing a new name. Call `open(event, currentTags)`. */
@Component({
  selector: 'app-tm-tag-picker',
  standalone: true,
  imports: [FormsModule, PopoverModule],
  template: `
    <p-popover #pop appendTo="body" styleClass="tm-popover" (onShow)="focus()" (onHide)="query.set('')">
      <div class="tm-picker">
        <input
          #search
          class="tm-picker-search"
          type="text"
          placeholder="Find or create a tag"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          (keydown.enter)="pickFirst()"
          (keydown.escape)="pop.hide()"
          aria-label="Find or create a tag"
        />
        <ul class="tm-picker-list">
          @for (t of filtered(); track t.id) {
            <li>
              <button type="button" class="tm-picker-item" (click)="choose({ tagId: t.id })">
                <span class="tm-chip tm-tag" [style.background]="colors(t.color).bg" [style.color]="colors(t.color).fg">{{ t.name }}</span>
              </button>
            </li>
          }
          @if (canCreate()) {
            <li>
              <button type="button" class="tm-picker-item" (click)="choose({ name: query().trim() })">
                <i class="pi pi-plus"></i> <span>Create tag “{{ query().trim() }}”</span>
              </button>
            </li>
          }
          @if (!filtered().length && !canCreate()) {
            <li class="tm-picker-empty">Type to create a tag</li>
          }
        </ul>
      </div>
    </p-popover>
  `,
})
export class TmTagPickerComponent {
  private readonly store = inject(TmStoreService);
  picked = output<TagPick>();

  private readonly pop = viewChild.required<Popover>('pop');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');
  query = signal('');
  private selected = signal<Set<string>>(new Set());
  readonly colors = chipColors;

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const taken = this.selected();
    return this.store
      .tags()
      .filter((t) => !taken.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
      .slice(0, 50);
  });

  readonly canCreate = computed(() => {
    const q = this.query().trim().toLowerCase();
    return !!q && !this.store.tags().some((t) => t.name.toLowerCase() === q);
  });

  open(event: Event, current: TmTag[]) {
    this.selected.set(new Set(current.map((t) => t.id)));
    void this.store.loadTags();
    this.pop().toggle(event);
  }

  focus() {
    setTimeout(() => this.search()?.nativeElement.focus());
  }

  pickFirst() {
    const first = this.filtered()[0];
    if (this.canCreate() && (!first || first.name.toLowerCase() !== this.query().trim().toLowerCase())) {
      // Exact-ish typing of a new name creates it unless an existing tag starts with it.
      if (!first || !first.name.toLowerCase().startsWith(this.query().trim().toLowerCase())) {
        this.choose({ name: this.query().trim() });
        return;
      }
    }
    if (first) this.choose({ tagId: first.id });
  }

  choose(pick: TagPick) {
    this.pop().hide();
    this.picked.emit(pick);
  }
}
