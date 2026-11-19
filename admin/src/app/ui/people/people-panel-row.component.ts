import { Component, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { Person } from '../../task-manager/core/tm.types';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { RecordCardBadge, RecordCardComponent } from '../record-card';

export type PeoplePanelRowTag = {
  label: string;
  severity?: 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';
};

/** One list row for account and project People panels (CRM, team, unlinked snapshot). */
@Component({
  selector: 'app-people-panel-row',
  standalone: true,
  host: { class: 'record-card-host' },
  imports: [RecordCardComponent, CopyEmailComponent, TagModule],
  template: `
    <app-record-card
      [person]="person()"
      [title]="title()"
      [subtitle]="subtitle()"
      [badges]="badges()"
      [clickable]="clickable()"
      (titleClick)="titleClick.emit()"
    >
      <ng-content select="[recordActions]" ngProjectAs="[recordActions]" />
      <div recordBody class="people-panel-row-body">
        @if (hint()) {
          <p class="people-panel-row-hint">{{ hint() }}</p>
        }
        <div class="people-panel-row-footer">
          <div class="people-panel-contact-lines">
            @if (jobTitle()?.trim()) {
              <span class="people-panel-person-title">{{ jobTitle() }}</span>
            }
            @if (email()?.trim()) {
              <app-copy-email [email]="email()!" [muted]="true" [block]="true" />
            } @else if (phone()?.trim()) {
              <span class="people-panel-meta">{{ phone() }}</span>
            }
          </div>
          @if (footerTags().length) {
            <div class="people-panel-row-badges">
              @for (tag of footerTags(); track tag.label) {
                <p-tag [value]="tag.label" [severity]="tag.severity ?? 'secondary'" />
              }
            </div>
          }
        </div>
      </div>
    </app-record-card>
  `,
  styles: `
    .people-panel-row-hint {
      margin: 0 0 0.15rem;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
      line-height: 1.35;
    }
    .people-panel-row-footer {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 0.5rem;
      min-width: 0;
      width: 100%;
    }
    .people-panel-contact-lines {
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
      flex: 1 1 auto;
    }
    .people-panel-person-title {
      font-size: var(--fs-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      line-height: 1.35;
    }
    .people-panel-meta {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary, #6b7280);
    }
    .people-panel-row-badges {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 0.35rem;
      flex-shrink: 0;
      margin-left: auto;
    }
  `,
})
export class PeoplePanelRowComponent {
  person = input.required<Person>();
  title = input.required<string>();
  subtitle = input<string | null>(null);
  jobTitle = input<string | null>(null);
  email = input<string | null>(null);
  phone = input<string | null>(null);
  hint = input<string | null>(null);
  badges = input<RecordCardBadge[]>([]);
  footerTags = input<PeoplePanelRowTag[]>([]);
  clickable = input(false);
  titleClick = output<void>();
}