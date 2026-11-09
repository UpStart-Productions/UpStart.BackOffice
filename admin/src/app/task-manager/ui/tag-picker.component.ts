import { Component, computed, inject, output, viewChild } from '@angular/core';
import { chipColors } from '../core/tm-format.util';
import { TmStoreService } from '../core/tm-store.service';
import { TmTag } from '../core/tm.types';
import {
  FindOrCreatePickerComponent,
  type FindOrCreateOption,
  type FindOrCreatePick,
} from '../../ui/find-or-create-picker/find-or-create-picker.component';

export type TagPick = FindOrCreatePick;

export function tagPickToApiBody(pick: TagPick): { tagId?: string; name?: string } {
  return 'name' in pick ? { name: pick.name } : { tagId: pick.id };
}

/** Task tag picker — thin wrapper around `app-find-or-create-picker`. */
@Component({
  selector: 'app-tm-tag-picker',
  standalone: true,
  imports: [FindOrCreatePickerComponent],
  template: `
    <app-find-or-create-picker
      #picker
      placeholder="Find or create a tag"
      createKind="tag"
      emptyHint="Type to create a tag"
      [options]="tagOptions()"
      [pillStyle]="tagPillStyle"
      (picked)="picked.emit($event)"
    />
  `,
})
export class TmTagPickerComponent {
  private readonly store = inject(TmStoreService);
  private readonly picker = viewChild.required(FindOrCreatePickerComponent);

  readonly picked = output<TagPick>();
  readonly colors = chipColors;

  readonly tagOptions = computed((): FindOrCreateOption[] =>
    this.store.tags().map((t) => ({ id: t.id, name: t.name, color: t.color })),
  );

  readonly tagPillStyle = (opt: FindOrCreateOption) => this.colors(opt.color ?? null);

  open(event: Event, current: TmTag[]) {
    void this.store.loadTags();
    this.picker().open(
      event,
      current.map((t) => t.id),
    );
  }
}
