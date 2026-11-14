import { Directive, input, output } from '@angular/core';
import type { RowActionItem } from '../row-actions-menu/row-actions-menu.component';
import type { RecordCardBadge, RecordCardVariant } from './record-card.component';

/** Inputs every type wrapper passes through to app-record-card. */
@Directive()
export abstract class RecordCardWrapper {
  variant = input<RecordCardVariant>('compact');
  /** Extra badges after the type's own (e.g. Primary). */
  extraBadges = input<RecordCardBadge[]>([]);
  actions = input<RowActionItem[]>([]);
  /** Replace the type's default subtitle (e.g. a person's role at this account). */
  subtitleOverride = input<string | null>(null);
  /** Title selects the row instead of navigating (filter lists). */
  pickerMode = input(false);
  /** Picked in a filter list (record id). */
  selected = input(false);
  picked = output<string>();
}

/** Shared pass-through markup: projects [recordActions] and [recordBody] from the wrapper's host into the card. */
export const RECORD_CARD_SLOTS = `
  <ng-container ngProjectAs="[recordActions]"><ng-content select="[recordActions]" /></ng-container>
  <ng-container ngProjectAs="[recordBody]"><ng-content select="[recordBody]" /></ng-container>
`;
