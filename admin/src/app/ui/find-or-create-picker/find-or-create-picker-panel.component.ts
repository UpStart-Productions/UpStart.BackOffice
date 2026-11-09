import { Component, computed, ElementRef, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FindOrCreateOption, FindOrCreatePick } from './find-or-create-picker.types';

/** Shared find-or-create field (popover or tag-input overlay). */
@Component({
  selector: 'app-find-or-create-picker-panel',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="ubo-picker" [class.ubo-picker--embedded]="embedded()">
      @if (showSearch()) {
        <input
          #search
          class="ubo-picker-search"
          type="text"
          [placeholder]="placeholder()"
          [ngModel]="query()"
          (ngModelChange)="queryChange.emit($event)"
          (keydown.enter)="pickFirst($event)"
          (keydown.escape)="escape.emit()"
          [attr.aria-label]="placeholder()"
        />
      }
      <ul class="ubo-picker-list">
        @for (opt of filtered(); track opt.id) {
          <li>
            <button type="button" class="ubo-picker-item" (mousedown)="$event.preventDefault()" (click)="choose({ id: opt.id })">
              @if (pillStyle()(opt); as style) {
                <span class="ubo-tag-pill" [style.background]="style.bg" [style.color]="style.fg">
                  <span class="ubo-tag-pill-label">{{ opt.name }}</span>
                </span>
              } @else {
                <span class="ubo-tag-pill">
                  <span class="ubo-tag-pill-label">{{ opt.name }}</span>
                </span>
              }
            </button>
          </li>
        }
        @if (canCreate()) {
          <li>
            <button type="button" class="ubo-picker-item" (mousedown)="$event.preventDefault()" (click)="choose({ name: query().trim() })">
              <i class="pi pi-plus" aria-hidden="true"></i>
              <span>Create {{ createKind() }} “{{ query().trim() }}”</span>
            </button>
          </li>
        }
        @if (!filtered().length && !canCreate()) {
          <li class="ubo-picker-empty">{{ emptyHint() }}</li>
        }
      </ul>
    </div>
  `,
})
export class FindOrCreatePickerPanelComponent {
  readonly options = input.required<FindOrCreateOption[]>();
  readonly hiddenIds = input<string[]>([]);
  readonly placeholder = input('Find or create…');
  readonly createKind = input('item');
  readonly emptyHint = input('Type to create an item');
  /** List-only under `app-tag-input` (search stays in the field). */
  readonly embedded = input(false);
  readonly showSearch = input(true);
  readonly pillStyle = input<(opt: FindOrCreateOption) => { bg: string; fg: string } | null>(() => null);

  readonly query = input('');
  readonly queryChange = output<string>();
  readonly picked = output<FindOrCreatePick>();
  readonly escape = output<void>();

  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const hidden = new Set(this.hiddenIds());
    return this.options()
      .filter((o) => !hidden.has(o.id) && (!q || o.name.toLowerCase().includes(q)))
      .slice(0, 50);
  });

  readonly canCreate = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return false;
    const hidden = new Set(this.hiddenIds());
    return !this.options().some((o) => !hidden.has(o.id) && o.name.toLowerCase() === q);
  });

  readonly hasContent = computed(() => {
    if (this.embedded()) {
      return this.filtered().length > 0 || this.canCreate();
    }
    return this.filtered().length > 0 || this.canCreate() || !!this.query().trim();
  });

  focus() {
    setTimeout(() => this.search()?.nativeElement.focus());
  }

  pickFirst(event: Event) {
    event.preventDefault();
    const first = this.filtered()[0];
    if (this.canCreate() && (!first || first.name.toLowerCase() !== this.query().trim().toLowerCase())) {
      if (!first || !first.name.toLowerCase().startsWith(this.query().trim().toLowerCase())) {
        this.choose({ name: this.query().trim() });
        return;
      }
    }
    if (first) this.choose({ id: first.id });
    else if (this.canCreate()) this.choose({ name: this.query().trim() });
  }

  choose(pick: FindOrCreatePick) {
    this.picked.emit(pick);
  }
}
