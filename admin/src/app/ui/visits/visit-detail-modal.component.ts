import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppDialogModule } from '../../core/app-dialog.module';
import { VisitDetailService } from '../../core/visit-detail.service';
import { VisitPage } from '../../pages/visits/visit.page';

/**
 * The one visit log modal (mounted in the shell): what happened on a visit (forms, actual time, notes) over the
 * current screen. The header names the visit type, client (opens their page) and planned time, with the status and
 * the save indicator. Changing the plan (cancel, delete, edit) happens on the Schedule, not here.
 */
@Component({
  selector: 'app-visit-detail-modal',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, AppDialogModule, VisitPage],
  styles: `
    .vdm-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex: 1 1 auto;
      min-width: 0;
      margin-right: 0.5rem;
    }
    .vdm-title,
    .vdm-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-width: 0;
    }
  `,
  template: `
    @if (detail.visitId(); as id) {
      <p-dialog
        [visible]="true"
        (visibleChange)="$event ? null : detail.close()"
        [modal]="true"
        [dismissableMask]="false"
        [draggable]="false"
        [resizable]="false"
        appendTo="body"
        [style]="{ width: 'min(72rem, 96vw)' }"
      >
        <ng-template #header>
          <div class="vdm-header">
            <div class="vdm-title">
              @if (page()?.visit(); as v) {
                <span class="p-dialog-title">
                  {{ v.visitType.name }} visit log for
                  <a [routerLink]="['/accounts', v.clientId]" (click)="detail.close()">{{ v.clientName }}</a>
                  on {{ page()?.whenLabel() }}
                </span>
                @if (page()?.metaTemplate(); as meta) {
                  <ng-container *ngTemplateOutlet="meta" />
                }
              } @else {
                <span class="p-dialog-title">Visit log</span>
              }
            </div>
            @if (page()?.actionsTemplate(); as actions) {
              <div class="vdm-actions"><ng-container *ngTemplateOutlet="actions" /></div>
            }
          </div>
        </ng-template>
        @for (key of [id]; track key) {
          <app-visit-page [embedded]="true" [visitId]="key" (leave)="detail.close()" />
        }
      </p-dialog>
    }
  `,
})
export class VisitDetailModalComponent {
  readonly detail = inject(VisitDetailService);
  readonly page = viewChild(VisitPage);
}
