import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import type { VisitDto, VisitFormDto } from '@upstart/back-office/shared';
import { Person } from '../../task-manager/core/tm.types';
import { RecordCardBadge, RecordCardComponent } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

/**
 * A visit as the standard record card: the team member's avatar, date and visit type, who and when, its status, and
 * (when given) the forms of its visit type with whether they were filled in.
 */
@Component({
  selector: 'app-visit-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RouterLink, TagModule, RecordCardComponent],
  providers: [DatePipe],
  styles: `
    .visit-card-forms {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
      margin-top: 0.5rem;
    }
    .visit-card-form {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
    }
  `,
  template: `
    <app-record-card
      [variant]="variant()"
      [person]="avatar()"
      icon="calendar-clock"
      [title]="title()"
      [link]="['/visits', visit().id]"
      [subtitle]="subtitleOverride() ?? subtitle()"
      [badges]="[...statusBadges(), ...extraBadges()]"
      [actions]="actions()"
    >
      ${RECORD_CARD_SLOTS}
      @if (forms(); as fs) {
        @if (fs.length && visit().status !== 'SCHEDULED') {
          <div recordBody class="visit-card-forms">
            @for (f of fs; track f.formId) {
              <span class="visit-card-form">
                @if (f.recordId) {
                  <a class="text-primary" [routerLink]="['/forms/results', f.recordId]">{{ f.formName }}</a>
                  <p-tag [value]="f.submittedAt ? 'Submitted' : 'In progress'" [severity]="f.submittedAt ? 'success' : 'info'" />
                } @else {
                  <span>{{ f.formName }}</span>
                  <p-tag value="Not filled in" severity="warn" />
                }
              </span>
            }
          </div>
        }
      }
    </app-record-card>
  `,
})
export class VisitCardComponent extends RecordCardWrapper {
  private readonly datePipe = inject(DatePipe);

  visit = input.required<VisitDto>();
  /** The forms of its visit type (past visits); omitted for upcoming ones. */
  forms = input<VisitFormDto[] | null>(null);

  /** When it happened (actual start) or is planned. */
  private readonly when = computed(() => this.visit().startedAt ?? this.visit().startAt);

  readonly title = computed(() => `${this.datePipe.transform(this.when(), 'EEE, MMM d')} · ${this.visit().visitType.name}`);

  readonly subtitle = computed(() => {
    const v = this.visit();
    const start = this.datePipe.transform(this.when(), 'h:mm a');
    const end = this.datePipe.transform(v.endedAt ?? v.endAt, 'h:mm a');
    return `${v.teamMember?.name ?? 'Unassigned'} · ${start} – ${end}`;
  });

  readonly avatar = computed<Person | null>(() => {
    const m = this.visit().teamMember;
    if (!m) return null;
    return { id: m.id, name: m.name, email: m.name, firstName: null, lastName: null, avatarUrl: m.avatarUrl, role: 'USER', isGuest: false };
  });

  readonly statusBadges = computed<RecordCardBadge[]>(() => {
    const v = this.visit();
    switch (v.status) {
      case 'COMPLETED':
        return [{ label: 'Done', severity: 'success' }];
      case 'IN_PROGRESS':
        return [{ label: 'In progress', severity: 'info' }];
      case 'CANCELLED':
        return [{ label: 'Cancelled', severity: 'secondary' }];
      default:
        return new Date(v.endAt).getTime() < Date.now() ? [{ label: 'Missed', severity: 'warn' }] : [];
    }
  });
}
