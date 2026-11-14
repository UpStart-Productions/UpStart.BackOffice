import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { Person } from '../../task-manager/core/tm.types';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { RowActionItem, RowActionsMenuComponent } from '../row-actions-menu/row-actions-menu.component';

export type RecordCardVariant = 'compact' | 'card';
export type RecordCardBadge = { label: string; severity?: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast' };
export type RecordCardTone = 'info' | 'success' | 'warning' | 'danger' | 'neutral';
export type RecordCardDetail = { icon: string; text: string; href?: string | null };

/**
 * The standard record card: one design for people, accounts, invoices, projects and pipeline cards.
 *  - compact: an open row for lists in side panels.
 *  - card: a bordered business card for the main record at the top of a side column (adds detail lines).
 * Leading is an avatar (person) or a Lucide icon. Extra icon buttons go in [recordActions]; a ⋮ menu comes from actions.
 * Type wrappers (app-person-card, app-account-card, …) fill these from a record; use those on screens.
 */
@Component({
  selector: 'app-record-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RouterLink, TagModule, LucideIconComponent, TmAvatarComponent, RowActionsMenuComponent],
  template: `
    <div
      class="record-card"
      [class.record-card--card]="variant() === 'card'"
      [class.record-card--compact]="variant() === 'compact'"
      [class.record-card--selected]="selected()"
      [class.record-card--single-line]="singleLine()"
    >
      <div class="record-card-head">
        @if (person(); as p) {
          <app-tm-avatar [person]="p" size="lg" [showTitle]="false" />
        } @else {
          <span class="record-card-icon ubo-avatar ubo-avatar--lg" [attr.data-tone]="tone()" aria-hidden="true">
            <nmp-lucide-icon [name]="icon() ?? 'circle'" />
          </span>
        }
        <div class="record-card-main">
          <div class="record-card-title-line">
            @if (link(); as l) {
              <a class="record-card-title" [routerLink]="l" [queryParams]="linkQuery()">{{ title() }}</a>
            } @else if (clickable()) {
              <button type="button" class="record-card-title record-card-title--button" (click)="titleClick.emit()">{{ title() }}</button>
            } @else {
              <span class="record-card-title record-card-title--plain">{{ title() }}</span>
            }
            @for (b of badges(); track b.label) {
              <p-tag [value]="b.label" [severity]="b.severity ?? 'secondary'" />
            }
          </div>
          @if (subtitle(); as s) {
            <span class="record-card-subtitle">{{ s }}</span>
          }
          @if (variant() === 'card' && details().length) {
            <div class="record-card-details">
              @for (d of details(); track d.text) {
                <div class="record-card-detail">
                  <nmp-lucide-icon [name]="d.icon" aria-hidden="true" />
                  @if (d.href) {
                    <a [href]="d.href">{{ d.text }}</a>
                  } @else {
                    <span>{{ d.text }}</span>
                  }
                </div>
              }
            </div>
          }
          <ng-content select="[recordBody]" />
        </div>
        <div class="record-card-actions">
          <ng-content select="[recordActions]" />
          @if (actions().length) {
            <app-row-actions-menu [items]="actions()" size="small" [ariaLabel]="title() + ' actions'" />
          }
        </div>
      </div>
    </div>
  `,
})
export class RecordCardComponent {
  variant = input<RecordCardVariant>('compact');
  /** Lucide icon name for non-person records (building-2, house, receipt, folder, square-kanban). */
  icon = input<string | null>(null);
  /** A person: shows their avatar instead of an icon. */
  person = input<Person | null>(null);
  title = input.required<string>();
  link = input<string | unknown[] | null>(null);
  linkQuery = input<Record<string, string> | null>(null);
  subtitle = input<string | null>(null);
  badges = input<RecordCardBadge[]>([]);
  /** Business card only. */
  details = input<RecordCardDetail[]>([]);
  /** No link: the title is a button that emits titleClick (e.g. open a detail popup). */
  clickable = input(false);
  /** Highlight row when picked in a filter list (e.g. Activity side panel). */
  selected = input(false);
  titleClick = output<void>();
  /** Items for the small ⋮ menu on the right. */
  actions = input<RowActionItem[]>([]);
  /** Title and subtitle stay on one line each and end in … when too long (Dashboard rows). */
  singleLine = input(false);
  /** Icon tile color (severity tokens). Default is the blue record icon. */
  tone = input<RecordCardTone | null>(null);
}
