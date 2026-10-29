import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { areaEnabled } from '@upstart/back-office/shared';
import { CareApi, CareClientForm } from '../../core/care.api';
import { SessionService } from '../../core/session.service';

/** Organization page side card: this organization's Care forms (shown when the Care module is on). */
@Component({
  selector: 'app-care-client-card',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule],
  template: `
    @if (forms().length) {
      <div class="card card--side">
        <div class="card-header"><h3 class="card-title">Care</h3></div>
        <div class="side-list">
          @for (f of forms(); track f.formId) {
            <div class="side-list-row">
              <div class="side-list-body">
                @if (f.recordId) {
                  <a class="side-list-title" [routerLink]="['/care/records', f.recordId]">{{ f.name }}</a>
                  <span class="side-list-detail">Updated {{ f.updatedAt | date: 'MMM d, y' }}</span>
                } @else {
                  <span class="side-list-title">{{ f.name }}</span>
                  <span class="side-list-detail">Not started</span>
                }
              </div>
              @if (!f.recordId && f.myAccess === 'edit') {
                <p-button label="Start" icon="pi pi-plus" size="small" severity="secondary" [outlined]="true" [loading]="starting() === f.formId" (onClick)="start(f)" />
              }
            </div>
          }
        </div>
      </div>
    }
  `,
})
export class CareClientCardComponent {
  private readonly care = inject(CareApi);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  clientId = input.required<string>();

  forms = signal<CareClientForm[]>([]);
  starting = signal<string | null>(null);
  private readonly careOn = computed(() => {
    const me = this.session.me();
    return !!me && areaEnabled(me.modules, 'care') && (me.role === 'ADMIN' || !!me.permissions?.care);
  });

  constructor() {
    effect(() => {
      const id = this.clientId();
      if (this.careOn()) void this.load(id);
      else this.forms.set([]);
    });
  }

  private async load(clientId: string) {
    try {
      this.forms.set(await this.care.forClient(clientId));
    } catch {
      this.forms.set([]);
    }
  }

  async start(f: CareClientForm) {
    this.starting.set(f.formId);
    try {
      const { id } = await this.care.createRecord(f.formId, this.clientId());
      await this.router.navigate(['/care/records', id]);
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not start', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.starting.set(null);
    }
  }
}
