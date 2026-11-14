import { Component, computed, input, output } from '@angular/core';
import { Person } from '../../task-manager/core/tm.types';
import { RecordCardComponent, RecordCardDetail } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

export type PersonCardData = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  title?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  emails?: { email: string; isPrimary?: boolean }[];
  email?: string | null;
};

/** A person (People record) as the standard record card. */
@Component({
  selector: 'app-person-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent],
  template: `
    <app-record-card
      [variant]="variant()"
      [person]="avatar()"
      [title]="name()"
      [link]="openInPopup() || pickerMode() ? null : ['/people', person().id]"
      [clickable]="openInPopup() || pickerMode()"
      [selected]="selected()"
      (titleClick)="pickerMode() ? picked.emit(person().id) : open.emit(person().id)"
      [subtitle]="subtitleOverride() ?? person().title ?? null"
      [badges]="extraBadges()"
      [details]="details()"
      [actions]="actions()"
    >${RECORD_CARD_SLOTS}</app-record-card>
  `,
})
export class PersonCardComponent extends RecordCardWrapper {
  person = input.required<PersonCardData>();
  /** true: the name emits open (People panel opens its detail popup) instead of going to the person page. */
  openInPopup = input(false);
  open = output<string>();

  readonly email = computed(() => {
    const p = this.person();
    return p.emails?.find((e) => e.isPrimary)?.email ?? p.emails?.[0]?.email ?? p.email ?? '';
  });
  readonly name = computed(() => {
    const p = this.person();
    return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || p.name?.trim() || this.email() || 'Person';
  });
  readonly avatar = computed<Person>(() => {
    const p = this.person();
    return {
      id: p.id,
      name: this.name(),
      email: this.email() || this.name(),
      firstName: p.firstName ?? null,
      lastName: p.lastName ?? null,
      avatarUrl: p.avatarUrl ?? null,
      role: 'USER',
      isGuest: false,
    };
  });
  readonly details = computed<RecordCardDetail[]>(() => {
    const out: RecordCardDetail[] = [];
    const email = this.email();
    if (email) out.push({ icon: 'mail', text: email, href: `mailto:${email}` });
    const phone = this.person().phone?.trim();
    if (phone) out.push({ icon: 'phone', text: phone, href: `tel:${phone.replace(/\s/g, '')}` });
    return out;
  });
}
