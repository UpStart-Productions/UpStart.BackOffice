import { Component, computed, input, viewChild } from '@angular/core';
import { PeoplePickListComponent } from '../ui/people-pick-list/people-pick-list.component';
import type { Person } from '../task-manager/core/tm.types';
import type { QuillPersonCardPick } from './quill-person-card.types';

/** Overlay body for the Quill "person card" button: the shared people pick list. */
@Component({
  selector: 'app-quill-person-card-picker',
  standalone: true,
  imports: [PeoplePickListComponent],
  template: `
    <div class="quill-person-card-picker" role="dialog" aria-label="Insert person card">
      <app-people-pick-list
        [people]="rows()"
        [loading]="loading()"
        (picked)="choose($event)"
        (cancel)="onCancel()()"
      />
    </div>
  `,
  styles: `
    .quill-person-card-picker {
      padding: 0.35rem;
    }
    .quill-person-card-picker app-people-pick-list {
      display: block;
      width: min(var(--layout-main-offset-open), calc(100vw - 2rem));
    }
  `,
})
export class QuillPersonCardPickerComponent {
  loading = input(false);
  people = input<QuillPersonCardPick[]>([]);
  onPick = input<(pick: QuillPersonCardPick) => void>(() => undefined);
  onCancel = input<() => void>(() => undefined);

  private readonly list = viewChild.required(PeoplePickListComponent);

  /** Person cards as pick-list rows (same row as every other people picker). */
  readonly rows = computed<Person[]>(() =>
    this.people().map((p) => ({
      id: p.contactId,
      name: p.name,
      email: p.email,
      firstName: p.firstName,
      lastName: p.lastName,
      avatarUrl: p.avatarUrl,
      role: p.role ?? '',
      isGuest: false,
    })),
  );

  choose(row: Person | null): void {
    if (!row) return;
    const pick = this.people().find((p) => p.contactId === row.id);
    if (pick) this.onPick()(pick);
  }

  focusSearch(): void {
    this.list().focus();
  }
}
