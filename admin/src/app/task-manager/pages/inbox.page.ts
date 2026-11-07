import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TmApiService } from '../core/tm-api.service';
import { relativeTime } from '../core/tm-format.util';
import { TmStoreService } from '../core/tm-store.service';
import { AppNotification } from '../core/tm.types';
import { PageComponent } from '../../ui/layout/page.component';

const TYPE_ICON: Record<string, string> = {
  task_assigned: 'pi-user-plus',
  task_mention: 'pi-at',
  task_comment: 'pi-comment',
  task_completed: 'pi-check-circle',
  project_added: 'pi-users',
  task_form_submission: 'pi-inbox',
  activity_forwarded: 'pi-send',
  activity_mention: 'pi-at',
  form_submission: 'pi-file-edit',
  client_form_submitted: 'pi-file-check',
  form_attached: 'pi-link',
  care_form_submission: 'pi-file-edit',
  care_shift_assigned: 'pi-calendar-plus',
};

/** Notification inbox: mark read / dismiss. Email prefs live on My Account. */
@Component({
  selector: 'app-tm-inbox-page',
  standalone: true,
  imports: [PageComponent, ButtonModule],
  template: `
    <div class="tm-page tm-inbox">
      <app-page title="Inbox">

      <ng-container ngProjectAs="[pageActions]">
        @if (unread() > 0) {
          <p-button label="Mark all read" icon="pi pi-check" severity="secondary" [outlined]="true" (onClick)="markAllRead()" />
        }
      </ng-container>

      @if (loading() && !items().length) {
        <div class="tm-page-loading"><i class="pi pi-spin pi-spinner"></i></div>
      } @else {
        <ul class="tm-inbox-list">
          @for (n of items(); track n.id) {
            <li class="tm-inbox-item" [class.unread]="!n.readAt" (click)="open(n)">
              <span class="tm-inbox-icon"><i class="pi" [class]="'pi ' + icon(n.type)"></i></span>
              <div class="tm-inbox-main">
                <div class="tm-inbox-title">{{ n.title }}</div>
                @if (n.body) { <div class="tm-inbox-body">{{ n.body }}</div> }
                <div class="tm-inbox-meta">
                  @if (n.meta?.projectName) { <span>{{ n.meta?.projectName }}</span> · }
                  <span>{{ relativeTime(n.createdAt) }}</span>
                </div>
              </div>
              <div class="tm-inbox-actions" (click)="$event.stopPropagation()">
                <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="toggleRead(n)" [attr.aria-label]="n.readAt ? 'Mark unread' : 'Mark read'" [title]="n.readAt ? 'Mark unread' : 'Mark read'">
                  <i class="pi" [class.pi-eye-slash]="!!n.readAt" [class.pi-eye]="!n.readAt"></i>
                </button>
                <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="dismiss(n)" aria-label="Dismiss" title="Dismiss"><i class="pi pi-times"></i></button>
              </div>
            </li>
          } @empty {
            <li class="tm-empty-state">
              <i class="pi pi-inbox"></i>
              <p>You're all caught up.</p>
            </li>
          }
        </ul>
      }
      </app-page>
    </div>
  `,
})
export class InboxPage implements OnInit {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  private readonly router = inject(Router);

  readonly relativeTime = relativeTime;

  items = signal<AppNotification[]>([]);
  loading = signal(true);

  readonly unread = computed(() => this.items().filter((n) => !n.readAt).length);

  ngOnInit() {
    void this.load();
  }

  icon(type: string) {
    return TYPE_ICON[type] ?? 'pi-bell';
  }

  async load() {
    this.loading.set(true);
    try {
      const active = await this.api.notifications();
      this.items.set(active.notifications);
      this.store.unreadCount.set(this.unread());
    } finally {
      this.loading.set(false);
    }
  }

  private patch(id: string, patch: Partial<AppNotification>) {
    this.items.update((list) => list.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    this.store.unreadCount.set(this.unread());
  }

  async open(n: AppNotification) {
    if (!n.readAt) {
      this.patch(n.id, { readAt: new Date().toISOString() });
      void this.api.markRead(n.id).catch(() => undefined);
    }
    const route = n.meta?.route?.filter(Boolean) ?? [];
    if (route.length) await this.router.navigate(['/', ...route]);
  }

  async toggleRead(n: AppNotification) {
    const read = !n.readAt;
    this.patch(n.id, { readAt: read ? new Date().toISOString() : null });
    try {
      await this.api.markRead(n.id, read);
    } catch {
      this.patch(n.id, { readAt: n.readAt });
    }
  }

  async dismiss(n: AppNotification) {
    this.items.update((list) => list.filter((x) => x.id !== n.id));
    this.store.unreadCount.set(this.unread());
    try {
      await this.api.dismissNotification(n.id);
    } catch {
      void this.load();
    }
  }

  async markAllRead() {
    const now = new Date().toISOString();
    this.items.update((list) => list.map((n) => ({ ...n, readAt: n.readAt ?? now })));
    this.store.unreadCount.set(0);
    await this.api.markAllRead().catch(() => this.load());
  }
}
