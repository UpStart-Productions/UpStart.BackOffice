import { Component, input, output, signal, viewChild } from '@angular/core';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';
import { PeoplePickListComponent } from '../../ui/people-pick-list/people-pick-list.component';
import { Person } from '../core/tm.types';

/** Popover list of people with search. Call `open(event, people, currentId)`. */
@Component({
  selector: 'app-tm-person-picker',
  standalone: true,
  imports: [AppPopoverModule, PeoplePickListComponent],
  template: `
    <p-popover #pop appendTo="body" appCenterPopoverCaret styleClass="tm-popover" (onHide)="list()?.reset()">
      <app-people-pick-list
        #pickList
        [people]="people()"
        [selectedId]="currentId()"
        [allowClear]="allowClear()"
        (picked)="choose($event)"
        (cancel)="pop.hide()"
      />
    </p-popover>
  `,
})
export class TmPersonPickerComponent {
  allowClear = input(true);
  picked = output<Person | null>();

  private readonly pop = viewChild.required<Popover>('pop');
  /** Popover content renders on show, so the list can be missing until then. */
  readonly list = viewChild<PeoplePickListComponent>('pickList');
  people = signal<Person[]>([]);
  currentId = signal<string | null>(null);

  open(event: Event, people: Person[], currentId: string | null) {
    this.people.set(people);
    this.currentId.set(currentId);
    this.pop().show(event, event.currentTarget ?? event.target);
    setTimeout(() => this.list()?.focus());
  }

  choose(p: Person | null) {
    this.picked.emit(p);
    this.pop().hide();
  }
}
