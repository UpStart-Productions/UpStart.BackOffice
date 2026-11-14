import { Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';

/** What a ghost table cell looks like. `blank` keeps the column empty (e.g. the row-actions column). */
export type EmptyGhostCell = 'blank' | 'avatar' | 'text' | 'strong' | 'avatar-text' | 'date' | 'amount' | 'tag';

/** Stable "random" widths so ghost lines read like real text and never jump between renders. */
const WIDTHS = [62, 48, 74, 55, 68, 42, 58, 70, 50];
/** Rows fade out toward the bottom so the ghost doesn't look like a broken table. */
/** Stable bar heights (%) for the ghost bar chart. */
const BAR_HEIGHTS = [45, 70, 55, 85, 40, 65, 50, 75, 60];
const FADE = [1, 1, 0.8, 0.5, 0.25, 0.15];

/**
 * Ghosted empty state: gray rounded placeholder shapes (PrimeNG `p-skeleton`) that follow the real layout,
 * with an optional message card on top. Styles: assets/layout/_empty-state.scss.
 *
 * - `shape="table-rows"`: place inside a `p-table` `emptymessage` template. Renders ghost `<tr>` rows that line up
 *   with the real column headers (one entry in `columns` per header), plus the message card centered over them.
 * - `shape="cards"`: bordered ghost cards (board lanes, e.g. Pipeline). Optional `hint` above them.
 * - `shape="bars"`: a light gray bar chart in place of an empty chart. Optional `labels` (real axis labels, one per bar).
 * - `shape="list"`: dashboard panels and side lists. Ghost record-card rows; use `hint` for one quiet line above them.
 *
 * Only show it when the area has never had data (not for "no search results").
 * Project an animation/illustration with `<ng-container ngProjectAs="[emptyArt]">`.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, ButtonModule, SkeletonModule],
  host: { style: 'display: contents' },
  template: `
    @if (shape() === 'table-rows') {
      @for (r of rowList(); track r.i) {
        <tr class="empty-ghost-row" aria-hidden="true" [style.opacity]="r.fade">
          @for (c of columns(); track $index) {
            <td>
              @switch (c) {
                @case ('blank') {}
                @case ('avatar') { <p-skeleton shape="circle" size="1.75rem" animation="none" /> }
                @case ('avatar-text') {
                  <span class="empty-ghost-inline">
                    <p-skeleton shape="circle" size="1.75rem" animation="none" />
                    <p-skeleton [width]="w(r.i, $index)" height="0.65rem" animation="none" />
                  </span>
                }
                @case ('strong') { <p-skeleton [width]="w(r.i, $index)" height="0.75rem" animation="none" /> }
                @case ('amount') { <p-skeleton [width]="w(r.i, $index, 0.7)" height="0.75rem" animation="none" styleClass="empty-ghost-right" /> }
                @case ('date') { <p-skeleton width="4.5rem" height="0.65rem" animation="none" styleClass="empty-ghost-light" /> }
                @case ('tag') { <p-skeleton width="3.75rem" height="1.35rem" borderRadius="1rem" animation="none" styleClass="empty-ghost-light" /> }
                @default { <p-skeleton [width]="w(r.i, $index)" height="0.65rem" animation="none" styleClass="empty-ghost-light" /> }
              }
            </td>
          }
        </tr>
      }
      @if (title()) {
        <tr class="empty-ghost-overlay-row">
          <td [attr.colspan]="columns().length">
            <div class="empty-ghost-overlay" [style.height]="rows() * 3.5 + 'rem'">
              <ng-container *ngTemplateOutlet="message" />
            </div>
          </td>
        </tr>
      }
    } @else if (shape() === 'cards') {
      <div class="empty-ghost-cards">
        @if (hint()) {
          <p class="empty-ghost-hint">{{ hint() }}</p>
        }
        @for (r of rowList(); track r.i) {
          <div class="empty-ghost-tile" aria-hidden="true" [style.opacity]="r.fade">
            <span class="empty-ghost-inline">
              <p-skeleton shape="circle" size="1.5rem" animation="none" />
              <p-skeleton [width]="w(r.i, 0)" height="0.65rem" animation="none" />
            </span>
            <p-skeleton [width]="w(r.i, 1, 0.8)" height="0.55rem" animation="none" styleClass="empty-ghost-light" />
            <p-skeleton [width]="w(r.i, 2, 0.5)" height="0.55rem" animation="none" styleClass="empty-ghost-light" />
          </div>
        }
      </div>
    } @else if (shape() === 'bars') {
      <div class="empty-ghost-bars" [style.height]="height()" aria-hidden="true">
        @for (b of barList(); track b.i) {
          <div class="empty-ghost-bar-col">
            <span class="empty-ghost-bar-track"><span class="empty-ghost-bar" [style.height.%]="b.h"></span></span>
            @if (b.label) {
              <span class="empty-ghost-bar-label">{{ b.label }}</span>
            }
          </div>
        }
      </div>
    } @else {
      <div class="empty-ghost-list">
        @if (hint()) {
          <p class="empty-ghost-hint">{{ hint() }}</p>
        }
        <div class="empty-ghost-list-rows" aria-hidden="true">
          @for (r of rowList(); track r.i) {
            <div class="empty-ghost-list-row" [style.opacity]="r.fade">
              <p-skeleton shape="circle" size="1.75rem" animation="none" />
              <span class="empty-ghost-list-lines">
                <p-skeleton [width]="w(r.i, 0)" height="0.65rem" animation="none" />
                <p-skeleton [width]="w(r.i, 1, 0.6)" height="0.55rem" animation="none" styleClass="empty-ghost-light" />
              </span>
              <p-skeleton width="3rem" height="1.2rem" borderRadius="1rem" animation="none" styleClass="empty-ghost-light" />
            </div>
          }
          @if (title()) {
            <div class="empty-ghost-overlay empty-ghost-overlay--list">
              <ng-container *ngTemplateOutlet="message" />
            </div>
          }
        </div>
      </div>
    }

    <ng-template #message>
      <div class="empty-ghost-card">
        <ng-content select="[emptyArt]" />
        <p class="empty-ghost-title">{{ title() }}</p>
        @if (body()) {
          <p class="empty-ghost-body">{{ body() }}</p>
        }
        @if (actionLabel()) {
          @if (actionLink(); as link) {
            <a pButton [label]="actionLabel()!" size="small" [routerLink]="link"></a>
          } @else {
            <p-button [label]="actionLabel()!" size="small" (onClick)="action.emit()" />
          }
        }
      </div>
    </ng-template>
  `,
})
export class EmptyStateComponent {
  readonly shape = input<'table-rows' | 'list' | 'cards' | 'bars'>('list');
  /** `table-rows` only: one entry per real table column, in order. */
  readonly columns = input<EmptyGhostCell[]>([]);
  readonly rows = input(5);
  readonly title = input<string | null>(null);
  readonly body = input<string | null>(null);
  readonly actionLabel = input<string | null>(null);
  /** Router link for the action. Leave empty to handle `(action)` instead. */
  readonly actionLink = input<string | unknown[] | null>(null);
  /** `list` / `cards`: one quiet instruction line above the ghost rows (dashboard panels). */
  readonly hint = input<string | null>(null);
  /** `bars` only: number of bars (ignored when `labels` is set). */
  readonly bars = input(7);
  /** `bars` only: real labels under each bar (e.g. Mon–Sun). */
  readonly labels = input<string[]>([]);
  /** `bars` only: chart height, e.g. `4.5rem` or `100%`. */
  readonly height = input('100%');
  readonly action = output<void>();

  readonly barList = computed(() => {
    const labels = this.labels();
    const n = labels.length || this.bars();
    return Array.from({ length: n }, (_, i) => ({ i, h: BAR_HEIGHTS[i % BAR_HEIGHTS.length], label: labels[i] ?? null }));
  });

  readonly rowList = computed(() =>
    Array.from({ length: this.rows() }, (_, i) => ({ i, fade: FADE[Math.min(i, FADE.length - 1)] })),
  );

  w(row: number, col: number, scale = 1): string {
    return `${Math.round(WIDTHS[(row * 3 + col) % WIDTHS.length] * scale)}%`;
  }
}
