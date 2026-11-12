import { Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Person } from '../../task-manager/core/tm.types';
import { PickRowComponent } from '../pick-row/pick-row.component';
import { personPickName, personPickSubtitle } from '../pick-row/pick-row.util';

/**
 * Search box + list of people as two-line pick rows. The body of every popover person picker
 * (task assignee, Quill person card). Host it inside a p-popover or overlay; call `focus()` on open.
 */
@Component({
  selector: 'app-people-pick-list',
  standalone: true,
  imports: [FormsModule, PickRowComponent],
  host: { class: 'tm-picker' },
  template: `
    <input
      #search
      class="tm-picker-search"
      type="text"
      [placeholder]="placeholder()"
      [ngModel]="query()"
      (ngModelChange)="query.set($event)"
      (keydown.enter)="pickFirst()"
      (keydown.escape)="cancel.emit()"
      [attr.aria-label]="placeholder()"
    />
    @if (loading()) {
      <p class="tm-picker-empty">Loading…</p>
    } @else {
      <ul class="tm-picker-list" role="listbox">
        @if (allowClear() && selectedId()) {
          <li>
            <button type="button" class="tm-picker-item" (click)="choose(null, $event)">
              <app-pick-row title="Unassign" subtitle="Remove the current person" [person]="null" />
            </button>
          </li>
        }
        @for (p of filtered(); track p.id) {
          <li>
            <button
              type="button"
              class="tm-picker-item"
              [class.selected]="p.id === selectedId()"
              (click)="choose(p, $event)"
              role="option"
            >
              <app-pick-row
                [person]="p"
                [title]="name(p)"
                [subtitle]="subtitle(p)"
                [tag]="p.isGuest ? 'Guest' : null"
              />
            </button>
          </li>
        } @empty {
          <li class="tm-picker-empty">No people match.</li>
        }
      </ul>
    }
  `,
})
export class PeoplePickListComponent {
  people = input<Person[]>([]);
  selectedId = input<string | null>(null);
  allowClear = input(false);
  loading = input(false);
  placeholder = input('Search people…');

  /** The chosen person, or null for Unassign. */
  picked = output<Person | null>();
  cancel = output<void>();

  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('search');
  readonly query = signal('');

  readonly name = personPickName;

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return this.people();
    return this.people().filter(
      (p) => personPickName(p).toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
  });

  subtitle(p: Person): string {
    return personPickSubtitle(p.email);
  }

  focus(): void {
    setTimeout(() => this.searchEl()?.nativeElement.focus(), 30);
  }

  reset(): void {
    this.query.set('');
  }

  pickFirst(): void {
    const first = this.filtered()[0];
    if (first) this.picked.emit(first);
  }

  choose(p: Person | null, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.picked.emit(p);
  }
}
