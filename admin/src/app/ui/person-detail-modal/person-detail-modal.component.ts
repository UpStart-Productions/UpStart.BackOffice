import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
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
  imports: [
    RouterLink,
    ButtonModule,
    AppDialogModule,
    PersonComponent,
    CopyEmailComponent,
    TagModule,
    MessageModule,
    SkeletonModule,
  ],
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
              size="lg"
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
          <div class="person-detail-modal-contact-lines">
            @if (c.title?.trim()) {
              <p class="person-detail-modal-role">{{ c.title }}</p>
            }
            @if (c.phone) {
              <span class="person-detail-modal-line">{{ c.phone }}</span>
            }
            @if (c.emails[0]?.email) {
              <app-copy-email [email]="c.emails[0].email" />
            }
          </div>
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
              <div class="person-detail-modal-orgs">
                @for (link of c.accountLinks; track link.clientId) {
                  <div class="person-detail-modal-org-row">
                    <a
                      [routerLink]="['/accounts', link.clientId]"
                      class="person-detail-modal-account-link"
                      (click)="visible.set(false)"
                    >{{ link.client.name }}</a>@if (link.role) { <span class="person-detail-modal-muted"> · {{ link.role }}</span> }
                  </div>
                }
              </div>
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

      <ng-template pTemplate="footer">
        @if (contact(); as c) {
          <div class="person-detail-modal-footer">
            <p-button
              label="Open in People"
              icon="pi pi-arrow-right"
              iconPos="right"
              severity="secondary"
              (onClick)="openInPeople(c.id)"
            />
          </div>
        }
      </ng-template>
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
    .person-detail-modal-contact-lines {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .person-detail-modal-role {
      margin: 0;
      font-size: var(--fs-xs);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-color-secondary);
      line-height: 1.35;
    }
    .person-detail-modal-line {
      font-size: var(--fs-sm);
      line-height: 1.35;
    }
    .person-detail-modal-body a.person-detail-modal-account-link {
      color: var(--color-text-link);
      font-weight: 500;
      text-decoration: none;
    }
    .person-detail-modal-body a.person-detail-modal-account-link:hover {
      color: var(--color-text-link-hover);
      text-decoration: underline;
    }
    .person-detail-modal-body .copy-email {
      color: var(--color-text-link);
      font-weight: 500;
    }
    .person-detail-modal-body .copy-email:hover .copy-email__text {
      text-decoration: underline;
    }
    .person-detail-modal-footer {
      display: flex;
      justify-content: flex-end;
      width: 100%;
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
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
      margin: 0;
    }
    .person-detail-modal-org-row {
      font-size: var(--fs-sm);
      line-height: 1.35;
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
  private readonly router = inject(Router);

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

  openInPeople(contactId: string) {
    this.visible.set(false);
    this.contact.set(null);
    void this.router.navigate(['/people', contactId]);
  }

  notesPlain(html: string): string {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}
