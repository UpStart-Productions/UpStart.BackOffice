import { Component, computed, input } from '@angular/core';
import { RecordCardComponent, RecordCardDetail } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

export type PipelineCardData = {
  id: string;
  organization: string;
  client?: { name: string } | null;
  pipelineName?: string | null;
  stageName?: string | null;
  primaryContact?: string | null;
  email?: string | null;
  nextAction?: string | null;
  nextActionDate?: string | null;
};

/** A pipeline card (lead) as the standard record card. */
@Component({
  selector: 'app-pipeline-card-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent],
  template: `
    <app-record-card
      [variant]="variant()"
      icon="square-kanban"
      [title]="card().client?.name ?? card().organization"
      [link]="pickerMode() ? null : ['/pipeline', card().id]"
      [clickable]="pickerMode()"
      [selected]="selected()"
      (titleClick)="picked.emit(card().id)"
      [subtitle]="subtitle()"
      [badges]="extraBadges()"
      [details]="details()"
      [actions]="actions()"
    >${RECORD_CARD_SLOTS}</app-record-card>
  `,
})
export class PipelineCardCardComponent extends RecordCardWrapper {
  card = input.required<PipelineCardData>();

  readonly subtitle = computed(
    () => this.subtitleOverride() ?? ([this.card().pipelineName, this.card().stageName].filter(Boolean).join(' · ') || null),
  );
  readonly details = computed<RecordCardDetail[]>(() => {
    const c = this.card();
    const out: RecordCardDetail[] = [];
    if (c.primaryContact) out.push({ icon: 'user', text: c.primaryContact });
    if (c.email) out.push({ icon: 'mail', text: c.email, href: `mailto:${c.email}` });
    if (c.nextAction) {
      const when = c.nextActionDate ? ` · ${new Date(c.nextActionDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : '';
      out.push({ icon: 'flag', text: `Next: ${c.nextAction}${when}` });
    }
    return out;
  });
}
