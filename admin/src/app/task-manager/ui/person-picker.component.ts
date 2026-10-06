import { Component, computed, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Popover, PopoverModule } from 'primeng/popover';
import { Person } from '../core/tm.types';
import { TmAvatarComponent } from './tm-avatar.component';

/** Popover list of people with search. Call `open(event, people, currentId)`. */
@Component({
  selector: 'app-tm-person-picker',
  standalone: true,
  imports: [FormsModule, PopoverModule, TmAvatarComponent],
  template: `
    <p-popover #pop appendTo="body" styleClass="tm-popover" (onHide)="query.set('')">
      <div class="tm-picker">
        <input
          #search
          class="tm-picker-search"
          type="text"
          placeholder="Search people"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          (keydown.enter)="pickFirst()"
          (keydown.escape)="pop.hide()"
          aria-label="Search people"
        />
        <ul class="tm-picker-list" role="listbox">
          @if (allowClear() && currentId()) {
            <li>
              <button type="button" class="tm-picker-item" (click)="choose(null)">
                <app-tm-avatar [person]="null" [size]="22" />
                <span>Unassign</span>
              </button>
            </li>
          }
          @for (p of filtered(); track p.id) {
            <li>
              <button type="button" class="tm-picker-item" [class.selected]="p.id === currentId()" (click)="choose(p)" role="option">
                <app-tm-avatar [person]="p" [size]="22" [showTitle]="false" />
                <span class="tm-picker-name">{{ p.name }}</span>
                <span class="tm-picker-meta">{{ p.role === 'GUEST' ? 'Guest' : p.email }}</span>
              </button>
            </li>
          } @empty {
            <li class="tm-picker-empty">No matches</li>
          }
        </ul>
      </div>
    </p-popover>
  `,
})
export class TmPersonPickerComponent {
  allowClear = input(true);
  picked = output<Person | null>();

  private readonly pop = viewChild.required<Popover>('pop');
  people = signal<Person[]>([]);
  currentId = signal<string | null>(null);
  query = signal('');

  filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.people().filter((p) => !q || p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q));
  });

  open(event: Event, people: Person[], currentId: string | null) {
    this.people.set(people);
    this.currentId.set(currentId);
    this.pop().show(event, event.currentTarget ?? event.target);
    setTimeout(() => (document.querySelector('.tm-picker-search') as HTMLInputElement | null)?.focus(), 30);
  }

  pickFirst() {
    const first = this.filtered()[0];
    if (first) this.choose(first);
  }

  choose(p: Person | null) {
    this.picked.emit(p);
    this.pop().hide();
  }
}
