import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { CommunicationsApi, contactName, ContactSummary, relativeTime } from '../../core/communications.api';
import { CopyEmailComponent } from '../copy-email/copy-email.component';
import { PersonComponent } from '../person/person.component';

/** The people linked to one client (Account), with their role there and when we last heard from them. */
@Component({
  selector: 'app-people-card',
  standalone: true,
  imports: [PersonComponent, RouterLink, ButtonModule, MessageModule, SkeletonModule, TagModule, CopyEmailComponent],
  template: `
    <div class="card" [class.card--side]="compact()" [class.people--compact]="compact()">
      <div class="card-header">
        <h3 class="card-title">People</h3>
        <a
          pButton
          label="Add person"
          icon="pi pi-plus"
          size="small"
          severity="secondary"
          routerLink="/people"
          [queryParams]="{ newForClient: clientId() }"
        ></a>
      </div>

      @if (error()) {
        <p-message severity="error" [text]="error()!" class="mb-3" />
      }

      @if (loading() && people().length === 0) {
        <div aria-busy="true" aria-label="Loading people">
          @for (n of skeletonRows; track n) {
            <div class="person-row"><p-skeleton width="40%" height="1rem" /></div>
          }
        </div>
      } @else if (people().length === 0) {
        <div class="empty-state">
          <i class="pi pi-users" aria-hidden="true"></i>
          <p>No people yet. They're added automatically when you file an email from them, or add one yourself.</p>
        </div>
      }

      @for (c of people(); track c.id) {
        <div class="person-row">
          <div class="person-main">
            <app-person [name]="name(c)" [firstName]="c.firstName" [lastName]="c.lastName" [email]="c.emails[0]?.email" [avatarUrl]="c.avatarUrl" [personId]="c.id" [link]="['/people', c.id]" />
            @if (c.autoCreated) {
              <p-tag value="New" severity="info" />
            }
            @if (!c.isActive) {
              <p-tag value="Inactive" severity="secondary" />
            }
            @if (roleFor(c); as role) {
              <span class="person-role">{{ role }}</span>
            } @else if (c.title) {
              <span class="person-role">{{ c.title }}</span>
            }
          </div>
          <div class="person-email"><app-copy-email [email]="c.emails[0]?.email" [muted]="true" /></div>
          <div class="person-last" [title]="c.lastContactAt ?? ''">
            {{ c.lastContactAt ? rel(c.lastContactAt) : 'No contact yet' }}
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .person-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) 8rem; gap: 1rem; align-items: center; padding: 0.6rem 0; border-top: 1px solid var(--surface-border, #e5e7eb); }
    .person-row:first-of-type { border-top: 0; }
    .person-main { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; min-width: 0; }
    .person-role { font-size: 0.85rem; color: var(--text-color-secondary, #6b7280); }
    .person-last { font-size: 0.85rem; color: var(--text-color-secondary, #6b7280); text-align: right; }
    /* Side-panel layout: one person per block, details stacked under the name. */
    .people--compact .person-row { grid-template-columns: minmax(0, 1fr); gap: 0.25rem; }
    .people--compact .person-last { text-align: left; }
    @media (max-width: 40rem) {
      .person-row { grid-template-columns: 1fr; gap: 0.25rem; }
      .person-last { text-align: left; }
    }
  `,
})
export class PeopleCardComponent {
  private readonly comms = inject(CommunicationsApi);

  clientId = input.required<string>();
  /** Narrow side-panel layout (organization page right column). */
  compact = input(false);

  people = signal<ContactSummary[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  readonly skeletonRows = [1, 2];

  name = contactName;
  rel = relativeTime;

  constructor() {
    effect(() => {
      const id = this.clientId();
      void this.load(id);
    });
  }

  roleFor(c: ContactSummary): string | null {
    return c.accountLinks.find((l) => l.clientId === this.clientId())?.role ?? null;
  }

  private async load(clientId: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const list = await this.comms.contacts({ clientId });
      // Most recently heard from first; people we have never heard from last.
      list.sort((a, b) => {
        if (a.lastContactAt && b.lastContactAt) return b.lastContactAt.localeCompare(a.lastContactAt);
        if (a.lastContactAt) return -1;
        if (b.lastContactAt) return 1;
        return contactName(a).localeCompare(contactName(b));
      });
      this.people.set(list);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load people');
    } finally {
      this.loading.set(false);
    }
  }
}
