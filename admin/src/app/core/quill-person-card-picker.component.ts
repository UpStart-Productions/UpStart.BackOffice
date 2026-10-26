import { Component, computed, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resolveAssetUrl } from './asset-url.util';
import { avatarPalette, initials } from '../task-manager/core/tm-format.util';
import type { QuillPersonCardPick } from './quill-person-card.types';

/** Popover body: searchable CRM people list (avatar, name, email). */
@Component({
  selector: 'app-quill-person-card-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="quill-person-card-picker" role="dialog" aria-label="Insert person card">
      <input
        #search
        class="quill-person-card-picker__search"
        type="search"
        placeholder="Search people…"
        [ngModel]="query()"
        (ngModelChange)="query.set($event)"
        (keydown.enter)="pickFirst()"
        (keydown.escape)="dismiss()"
        aria-label="Search people"
      />
      @if (loading()) {
        <p class="quill-person-card-picker__status">Loading…</p>
      } @else {
        <ul class="quill-person-card-picker__list" role="listbox">
          @for (p of filtered(); track p.contactId) {
            <li role="presentation">
              <button type="button" class="mention-suggest-item" (click)="choose(p, $event)" role="option">
                <div class="mention-suggest-item__avatar">
                  @if (photo(p); as src) {
                    <img [src]="src" alt="" />
                  } @else {
                    <span [style.background]="avatarBg(p)" [style.color]="avatarFg(p)">{{ initials(p) }}</span>
                  }
                </div>
                <span class="mention-suggest-item__name">{{ p.name }}</span>
                @if (p.email) {
                  <span class="mention-suggest-item__email">{{ p.email }}</span>
                }
              </button>
            </li>
          } @empty {
            <li class="quill-person-card-picker__empty">No people match.</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    .quill-person-card-picker {
      width: min(22rem, calc(100vw - 2rem));
      padding: 0.35rem;
    }
    .quill-person-card-picker__search {
      width: 100%;
      border: 1px solid var(--surface-border, #e5e7eb);
      border-radius: 0.375rem;
      padding: 0.45rem 0.6rem;
      margin-bottom: 0.35rem;
      font: inherit;
      box-sizing: border-box;
    }
    .quill-person-card-picker__list {
      list-style: none;
      margin: 0;
      padding: 0;
      max-height: 18rem;
      overflow-y: auto;
    }
    .quill-person-card-picker__list .mention-suggest-item {
      width: 100%;
      border: none;
      background: transparent;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .quill-person-card-picker__list .mention-suggest-item:hover {
      background: var(--tm-hover, color-mix(in srgb, var(--brand-primary) 8%, transparent));
    }
    .quill-person-card-picker__list .mention-suggest-item__avatar span {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      font-size: var(--fs-sm);
      font-weight: 700;
    }
    .quill-person-card-picker__empty,
    .quill-person-card-picker__status {
      margin: 0.5rem 0.35rem;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
    }
  `,
})
export class QuillPersonCardPickerComponent {
  loading = input(false);
  people = input<QuillPersonCardPick[]>([]);
  onPick = input<(pick: QuillPersonCardPick) => void>(() => undefined);
  onCancel = input<() => void>(() => undefined);

  query = signal('');

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.people();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.role?.toLowerCase().includes(q) ?? false),
    );
  });

  photo(p: QuillPersonCardPick): string | null {
    return resolveAssetUrl(p.avatarUrl);
  }

  avatarBg(p: QuillPersonCardPick): string {
    return avatarPalette(p.contactId).bg;
  }

  avatarFg(p: QuillPersonCardPick): string {
    return avatarPalette(p.contactId).fg;
  }

  initials(p: QuillPersonCardPick): string {
    return initials({ firstName: p.firstName, lastName: p.lastName, name: p.name, email: p.email });
  }

  pickFirst(): void {
    const first = this.filtered()[0];
    if (first) this.onPick()(first);
  }

  dismiss(): void {
    this.onCancel()();
  }

  choose(p: QuillPersonCardPick, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.onPick()(p);
  }

  focusSearch(): void {
    setTimeout(() => {
      const el = document.querySelector('.quill-person-card-picker__search') as HTMLInputElement | null;
      el?.focus();
    }, 0);
  }
}
