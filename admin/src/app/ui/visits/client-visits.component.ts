import { Component, effect, inject, input, signal } from '@angular/core';
import type { ClientVisitDto } from '@upstart/back-office/shared';
import { VisitsApi } from '../../core/visits.api';
import { VisitCardComponent } from '../record-card/visit-card.component';
import { ClientScheduleWidgetComponent } from './client-schedule-widget.component';

/**
 * Client page's Visits tab: visits that happened (or should have), newest first, each a visit card with the forms of
 * its visit type and whether they were filled in; and the client's schedule on the side (a month calendar that expands
 * to the full schedule). Cancelled visits are left out.
 */
@Component({
  selector: 'app-client-visits',
  standalone: true,
  imports: [VisitCardComponent, ClientScheduleWidgetComponent],
  template: `
    <div class="grid grid-3">
      <div class="stack span-2">
        @if (pastLoading()) {
          <div class="card"><p class="side-list-empty m-0"><i class="pi pi-spin pi-spinner mr-2"></i>Loading…</p></div>
        } @else {
          <div class="card">
            @for (v of past(); track v.id) {
              <app-visit-card [visit]="v" [forms]="v.forms" />
            } @empty {
              <p class="side-list-empty m-0">No visits yet.</p>
            }
          </div>
        }
      </div>

      <div class="side-panel-stack span-1">
        <app-client-schedule-widget [clientId]="clientId()" [clientName]="clientName()" (changed)="loadPast(clientId())" />
      </div>
    </div>
  `,
})
export class ClientVisitsComponent {
  private readonly visitsApi = inject(VisitsApi);

  clientId = input.required<string>();
  clientName = input('');

  past = signal<ClientVisitDto[]>([]);
  pastLoading = signal(false);

  constructor() {
    effect(() => {
      const id = this.clientId();
      void this.loadPast(id);
    });
  }

  async loadPast(clientId: string) {
    this.pastLoading.set(true);
    try {
      this.past.set(await this.visitsApi.clientHistory(clientId));
    } catch {
      this.past.set([]);
    } finally {
      this.pastLoading.set(false);
    }
  }
}
