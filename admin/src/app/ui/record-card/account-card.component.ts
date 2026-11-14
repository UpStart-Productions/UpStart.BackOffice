import { Component, computed, input } from '@angular/core';
import { ACCOUNT_JOURNEY_LABELS, type AccountJourney } from '@upstart/back-office/shared';
import { relativeTime } from '../../core/communications.api';
import { RecordCardBadge, RecordCardComponent, RecordCardDetail } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

export type AccountCardData = {
  id: string;
  name: string;
  journey?: AccountJourney | string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  lastContactAt?: string | null;
};

/** An account (organization, household, …) as the standard record card. Put app-next-step in [recordBody]. */
@Component({
  selector: 'app-account-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent],
  template: `
    <app-record-card
      [variant]="variant()"
      icon="building-2"
      [title]="account().name"
      [link]="pickerMode() ? null : ['/accounts', account().id]"
      [clickable]="pickerMode()"
      [selected]="selected()"
      (titleClick)="picked.emit(account().id)"
      [subtitle]="subtitle()"
      [badges]="badges()"
      [details]="details()"
      [actions]="actions()"
    >${RECORD_CARD_SLOTS}</app-record-card>
  `,
})
export class AccountCardComponent extends RecordCardWrapper {
  account = input.required<AccountCardData>();

  readonly badges = computed<RecordCardBadge[]>(() => {
    const j = this.account().journey as AccountJourney | undefined;
    const own: RecordCardBadge[] =
      j === 'CLIENT' ? [{ label: ACCOUNT_JOURNEY_LABELS.CLIENT, severity: 'success' }]
      : j === 'PROSPECT' ? [{ label: ACCOUNT_JOURNEY_LABELS.PROSPECT, severity: 'info' }]
      : [];
    return [...own, ...this.extraBadges()];
  });
  readonly subtitle = computed(() => {
    if (this.subtitleOverride()) return this.subtitleOverride();
    const at = this.account().lastContactAt;
    return at ? `Last contact ${relativeTime(at)}` : null;
  });
  readonly details = computed<RecordCardDetail[]>(() => {
    const a = this.account();
    const out: RecordCardDetail[] = [];
    const place = [a.address, [a.city, a.state].filter(Boolean).join(', ')].filter((v) => v?.trim()).join(', ');
    if (place) out.push({ icon: 'map-pin', text: place });
    if (a.email) out.push({ icon: 'mail', text: a.email, href: `mailto:${a.email}` });
    if (a.phone) out.push({ icon: 'phone', text: a.phone, href: `tel:${a.phone.replace(/\s/g, '')}` });
    if (a.website) out.push({ icon: 'globe', text: a.website, href: /^https?:\/\//i.test(a.website) ? a.website : `https://${a.website}` });
    return out;
  });
}
