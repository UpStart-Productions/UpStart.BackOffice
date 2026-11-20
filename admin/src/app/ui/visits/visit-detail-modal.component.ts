import { NgTemplateOutlet } from '@angular/common';
import { Component, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { VisitDetailService } from '../../core/visit-detail.service';
import { VisitPage } from '../../pages/visits/visit.page';

/**
 * The one visit log modal (mounted in the shell): what happened on a visit (forms, actual time, notes) over the
 * current screen. The header reads "Visit log" (with the status); Cancel and Save in the footer; below it, the visit type, client (opens
 * their page) and planned time. Changing the plan (cancel, delete, edit) happens on the Schedule, not here.
 */
@Component({
  selector: 'app-visit-detail-modal',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, ButtonModule, AppDialogModule, VisitPage],
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
    .vdm-heading {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }
    .vdm-subtitle {
      color: var(--p-text-muted-color);
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
        [style]="{ width: 'min(44rem, 96vw)' }"
        [dt]="{ header: { padding: '1.25rem 1.25rem 0.75rem' }, content: { padding: '0 1.25rem 1.25rem' } }"
      >
        <ng-template #header>
          <div class="vdm-header">
            <div class="vdm-heading">
              <div class="vdm-title">
                <span class="p-dialog-title">Visit log</span>
                @if (page()?.metaTemplate(); as meta) {
                  <ng-container *ngTemplateOutlet="meta" />
                }
              </div>
              @if (page()?.visit(); as v) {
                <div class="vdm-subtitle">
                  {{ v.visitType.name }} visit log for
                  <a [routerLink]="['/accounts', v.clientId]" (click)="detail.close()">{{ v.clientName }}</a>
                  on {{ page()?.whenLabel() }}
                </div>
              }
            </div>
            @if (page()?.actionsTemplate(); as actions) {
              <div class="vdm-actions"><ng-container *ngTemplateOutlet="actions" /></div>
            }
          </div>
        </ng-template>
        <ng-template #footer>
          @if (page()?.visit()?.canWork) {
            <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="page()?.saving()" (onClick)="detail.close()" />
            <p-button label="Save" icon="pi pi-check" [loading]="page()?.saving() ?? false" (onClick)="save()" />
          } @else {
            <p-button label="Close" severity="secondary" [text]="true" (onClick)="detail.close()" />
          }
        </ng-template>
        @for (key of [id]; track key) {
          <app-visit-page [embedded]="true" [visitId]="key" [initialTab]="detail.tab()" (leave)="detail.close()" />
        }
      </p-dialog>
    }
  `,
})
export class VisitDetailModalComponent {
  readonly detail = inject(VisitDetailService);
  readonly page = viewChild(VisitPage);

  async save() {
    const page = this.page();
    if (!page || (await page.save())) this.detail.close();
  }
}
