import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { Popover } from 'primeng/popover';
import { AppPopoverModule } from '../../core/app-popover.module';
import { FindOrCreatePickerPanelComponent } from './find-or-create-picker-panel.component';
import type { FindOrCreateOption, FindOrCreatePick } from './find-or-create-picker.types';
export type { FindOrCreateOption, FindOrCreatePick } from './find-or-create-picker.types';

/** Popover: filter existing options or create by name (Task tags, Settings pick lists). */
@Component({
  selector: 'app-find-or-create-picker',
  standalone: true,
  imports: [AppPopoverModule, FindOrCreatePickerPanelComponent],
  template: `
    <p-popover
      #pop
      appendTo="body"
      appCenterPopoverCaret
      styleClass="ubo-foc-popover"
      (onShow)="onShow()"
      (onHide)="panelQuery.set('')"
    >
      <app-find-or-create-picker-panel
        #panel
        [options]="options()"
        [hiddenIds]="hiddenIds()"
        [placeholder]="placeholder()"
        [createKind]="createKind()"
        [emptyHint]="emptyHint()"
        [pillStyle]="pillStyle()"
        [query]="panelQuery()"
        (queryChange)="panelQuery.set($event)"
        (picked)="onPicked($event)"
        (escape)="pop.hide()"
      />
    </p-popover>
  `,
})
export class FindOrCreatePickerComponent {
  readonly options = input.required<FindOrCreateOption[]>();
  readonly placeholder = input('Find or create…');
  readonly createKind = input('item');
  readonly emptyHint = input('Type to create an item');
  readonly pillStyle = input<(opt: FindOrCreateOption) => { bg: string; fg: string } | null>(() => null);

  readonly picked = output<FindOrCreatePick>();

  private readonly pop = viewChild.required<Popover>('pop');
  private readonly panel = viewChild.required<FindOrCreatePickerPanelComponent>('panel');

  readonly panelQuery = signal('');
  protected readonly hiddenIds = signal<string[]>([]);

  open(event: Event, hiddenOptionIds: string[] = [], anchor?: HTMLElement) {
    this.hiddenIds.set(hiddenOptionIds);
    const el = anchor ?? (event.currentTarget as HTMLElement);
    this.pop().toggle(event, el);
  }

  onShow() {
    this.panel().focus();
  }

  onPicked(pick: FindOrCreatePick) {
    this.pop().hide();
    this.picked.emit(pick);
  }
}
