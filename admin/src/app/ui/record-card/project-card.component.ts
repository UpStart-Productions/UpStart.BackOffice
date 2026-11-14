import { Component, computed, input } from '@angular/core';
import { RecordCardBadge, RecordCardComponent, RecordCardDetail } from './record-card.component';
import { RECORD_CARD_SLOTS, RecordCardWrapper } from './record-card-wrapper';

export type ProjectCardData = {
  id: string;
  name: string;
  isActive?: boolean;
  isBillable?: boolean;
  client?: { id?: string; name: string } | null;
  /** Optional task progress. */
  tasksDone?: number | null;
  tasksTotal?: number | null;
};

/** A project as the standard record card. */
@Component({
  selector: 'app-project-card',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent],
  template: `
    <app-record-card
      [variant]="variant()"
      icon="folder"
      [title]="project().name"
      [link]="['/projects', project().id]"
      [subtitle]="subtitle()"
      [badges]="badges()"
      [details]="details()"
      [actions]="actions()"
    >${RECORD_CARD_SLOTS}</app-record-card>
  `,
})
export class ProjectCardComponent extends RecordCardWrapper {
  project = input.required<ProjectCardData>();

  readonly progress = computed(() => {
    const p = this.project();
    return p.tasksTotal ? `${p.tasksDone ?? 0} of ${p.tasksTotal} tasks done` : null;
  });
  readonly badges = computed<RecordCardBadge[]>(() => [
    ...(this.project().isActive === false ? [{ label: 'Inactive', severity: 'secondary' as const }] : []),
    ...this.extraBadges(),
  ]);
  readonly subtitle = computed(() => this.subtitleOverride() ?? (this.variant() === 'card' ? this.project().client?.name ?? null : this.progress()));
  readonly details = computed<RecordCardDetail[]>(() => {
    const out: RecordCardDetail[] = [];
    if (this.progress()) out.push({ icon: 'list-checks', text: this.progress()! });
    if (this.project().isBillable !== undefined) out.push({ icon: 'banknote', text: this.project().isBillable ? 'Billable' : 'Not billable' });
    return out;
  });
}
