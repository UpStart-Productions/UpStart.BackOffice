import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { AppDialogModule } from '../../core/app-dialog.module';
import { CommunicationsApi, ContactSummary, contactName } from '../../core/communications.api';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { PersonComponent } from '../person/person.component';

/** Read-only person summary — opened from People panels, not a full page navigation. */
@Component({
  selector: 'app-person-detail-modal',
  standalone: true,
  imports: [RouterLink, AppDialogModule, PersonComponent, CopyEmailComponent, TagModule, MessageModule, SkeletonModule],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: 'min(28rem, 96vw)' }"
      appendTo="body"
    >
      <ng-template pTemplate="header">
        <div class="person-detail-modal-header">
          @if (contact(); as c) {
            <app-person
              [name]="contactName(c)"
              [firstName]="c.firstName"
              [lastName]="c.lastName"
              [email]="c.emails[0]?.email"
              [avatarUrl]="c.avatarUrl"
              [personId]="c.id"
              size="med"
              [avatarOnly]="true"
            />
            <span class="person-detail-modal-header-name">{{ contactName(c) }}</span>
          } @else {
            <span class="person-detail-modal-header-name">Person</span>
          }
        </div>
      </ng-template>
      @if (error()) {
        <p-message severity="error" [text]="error()!" />
      } @else if (loading()) {
        <p-skeleton width="60%" height="1.25rem" styleClass="mb-3" />
        <p-skeleton width="100%" height="0.875rem" styleClass="mb-2" />
        <p-skeleton width="80%" height="0.875rem" />
      } @else if (contact(); as c) {
        <div class="person-detail-modal-body">
          @if (c.title?.trim()) {
            <p class="person-detail-modal-role">{{ c.title }}</p>
          }
          @if (c.phone) {
            <div class="person-detail-modal-row">
              <span>{{ c.phone }}</span>
            </div>
          }
          @if (c.emails[0]?.email) {
            <div class="person-detail-modal-row">
              <app-copy-email [email]="c.emails[0].email" />
            </div>
          }
          @if (c.tags.length) {
            <div class="person-detail-modal-row person-detail-modal-row--tags">
              <span class="person-detail-modal-label">Tags</span>
              @for (t of c.tags; track t) {
                <p-tag [value]="t" severity="info" />
              }
            </div>
          }
          @if (c.accountLinks.length) {
            <div class="person-detail-modal-row person-detail-modal-row--orgs">
              <span class="person-detail-modal-label">Accounts</span>
              <ul class="person-detail-modal-orgs">
                @for (link of c.accountLinks; track link.clientId) {
                  <li>
                    <a
                      [routerLink]="['/accounts', link.clientId]"
                      class="person-detail-modal-account-link"
                      (click)="visible.set(false)"
                    >{{ link.client.name }}</a>@if (link.role) { <span class="person-detail-modal-muted"> · {{ link.role }}</span> }
                  </li>
                }
              </ul>
            </div>
          }
          @if (c.notes?.trim()) {
            <div class="person-detail-modal-row person-detail-modal-row--notes">
              <span class="person-detail-modal-label">Notes</span>
              <p class="person-detail-modal-notes">{{ notesPlain(c.notes) }}</p>
            </div>
          }
        </div>
      }
    </p-dialog>
  `,
  styles: `
    .person-detail-modal-header {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
      flex: 1 1 auto;
    }
    .person-detail-modal-header-name {
      font-size: 1.125rem;
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .person-detail-modal-role {
      margin: 0;
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
      line-height: 1.4;
    }
    .person-detail-modal-account-link {
      color: var(--text-color);
      font-weight: 500;
    }
    .person-detail-modal-body {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .person-detail-modal-row {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      font-size: var(--fs-sm);
    }
    .person-detail-modal-row--tags {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem;
    }
    .person-detail-modal-row--tags .person-detail-modal-label,
    .person-detail-modal-row--orgs .person-detail-modal-label {
      width: 100%;
    }
    .person-detail-modal-label {
      font-size: var(--fs-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
    }
    .person-detail-modal-orgs {
      margin: 0;
      padding-left: 1.1rem;
    }
    .person-detail-modal-muted {
      color: var(--text-color-secondary);
    }
    .person-detail-modal-notes {
      margin: 0;
      white-space: pre-wrap;
      line-height: 1.45;
      color: var(--text-color);
    }
  `,
})
export class PersonDetailModalComponent {
  private readonly comms = inject(CommunicationsApi);

  readonly contactName = contactName;
  readonly visible = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly contact = signal<ContactSummary | null>(null);

  async open(contactId: string): Promise<void> {
    this.error.set(null);
    this.contact.set(null);
    this.visible.set(true);
    this.loading.set(true);
    try {
      this.contact.set(await this.comms.contact(contactId));
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Could not load person');
    } finally {
      this.loading.set(false);
    }
  }

  onVisibleChange(visible: boolean) {
    if (!visible) {
      this.visible.set(false);
      this.contact.set(null);
      this.error.set(null);
    }
  }

  notesPlain(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
