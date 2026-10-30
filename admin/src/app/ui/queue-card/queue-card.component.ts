import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/**
 * Count card for a work queue (label, count badge, one-line help). Styles: assets/layout/_queue-cards.scss.
 * With `link` it opens that page (Dashboard). Without it, it is a toggle button that emits `pick` (Activity → To do).
 * Place several inside `<div class="queue-grid">`.
 */
@Component({
  selector: 'app-queue-card',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink],
  host: { style: 'display: contents' },
  template: `
    @if (link(); as l) {
      <a class="queue-card" [attr.data-accent]="accent()" [routerLink]="l" [queryParams]="queryParams()">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <button type="button" class="queue-card" [attr.data-accent]="accent()" [class.queue-card--active]="active()" [attr.aria-pressed]="active()" (click)="pick.emit()">
        <ng-container [ngTemplateOutlet]="body" />
      </button>
    }
    <ng-template #body>
      @if (accent()) {
        <span class="queue-card-rail" aria-hidden="true">
          @if (icon()) {
            <i [class]="'pi ' + icon()"></i>
          }
        </span>
      }
      <span class="queue-card-main">
        <span class="queue-card-head">
          <span class="queue-card-label">
            @if (icon() && !accent()) {
              <i [class]="'pi ' + icon()" aria-hidden="true"></i>
            }
            {{ label() }}
          </span>
          <span class="count-badge" [class.count-badge--info]="!!accent() && !!count()" [class.count-badge--muted]="!count()">{{ count() }}</span>
        </span>
        @if (help()) {
          <span class="queue-card-help">{{ help() }}</span>
        }
      </span>
    </ng-template>
  `,
})
export class QueueCardComponent {
  label = input.required<string>();
  /** Optional PrimeIcons name without the "pi " prefix: in the colored rail when `accent` is set, else before the label. */
  icon = input<string | null>(null);
  /**
   * Optional 30px rail on the left. Severity values use a white icon on a dark rail.
   * Palette values (Dashboard) use the light fill and the darker icon.
   */
  accent = input<'info' | 'success' | 'warning' | 'danger' | 'blue' | 'orange' | 'red' | 'rose' | 'teal' | null>(null);
  count = input(0);
  help = input<string | null>(null);
  /** Toggle mode only: this queue is the one showing. */
  active = input(false);
  link = input<string | unknown[] | null>(null);
  queryParams = input<Params | null>(null);
  pick = output<void>();
}
