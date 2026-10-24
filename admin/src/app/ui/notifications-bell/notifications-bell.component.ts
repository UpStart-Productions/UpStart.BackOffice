import {
  ChangeDetectorRef,
  Component,
  inject,
  OnDestroy,
  OnInit,
  output,
  signal,
  ViewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { notificationDisplayBody, type UserNotificationDto } from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { Popover, PopoverModule } from 'primeng/popover';
import { NotificationsApiService } from '../../core/notifications-api.service';
import { SessionService } from '../../core/session.service';
import { NotificationRelativeTimeComponent } from './notification-relative-time.component';
import { notificationUiActions, notificationUiRoute } from './notification-ui.registry';

@Component({
  selector: 'app-notifications-bell',
  standalone: true,
  imports: [PopoverModule, ButtonModule, RouterLink, NotificationRelativeTimeComponent],
  template: `
    <button
      type="button"
      class="layout-topbar-action notifications-bell-btn"
      (click)="popover.toggle($event)"
      aria-label="Notifications"
      aria-haspopup="true"
    >
      <i class="pi pi-bell"></i>
      @if (unreadCount() > 0) {
        <span class="notifications-bell-badge" [attr.aria-label]="unreadCount() + ' unread'">{{
          unreadCount() > 99 ? '99+' : unreadCount()
        }}</span>
      }
    </button>
    <p-popover
      #popover
      appendTo="body"
      styleClass="notifications-panel"
      [style]="{ width: 'calc(22rem + 100px)', minWidth: 'calc(22rem + 100px)' }"
      (onShow)="onPanelShow()"
    >
      <div class="notifications-panel-header">
        <h5 class="m-0">Notifications</h5>
      </div>
      @if (loading()) {
        <p class="p-3 text-color-secondary mb-0">Loading…</p>
      } @else if (notifications().length === 0) {
        <p class="p-3 text-color-secondary mb-0">No unread notifications.</p>
      } @else {
        <ul class="list-rows notifications-list">
          @for (n of notifications(); track n.id) {
            <li class="list-row list-row--bordered notifications-list-item">
              <div class="notifications-item-content">
                @if (linkFor(n); as link) {
                  <a
                    [routerLink]="link"
                    class="notifications-item-title"
                    (click)="onTitleClick(n.id)"
                  >{{ n.title }}</a>
                } @else {
                  <span class="notifications-item-title">{{ n.title }}</span>
                }
                @if (bodyFor(n); as bodyText) {
                  <p class="notifications-item-body mb-0">{{ bodyText }}</p>
                }
                <div class="notifications-item-footer">
                  <app-notification-relative-time [createdAt]="n.createdAt" />
                  <div class="notifications-item-actions">
                    @for (action of actionsFor(n); track action.id) {
                      <button
                        type="button"
                        class="p-button p-button-text p-button-sm"
                        [class.notifications-approve-btn]="action.tone === 'approve'"
                        [class.notifications-decline-btn]="action.tone === 'decline'"
                        [disabled]="action.disabled || actionLoading() === n.id + ':' + action.id"
                        (click)="runAction(n, action)"
                      >
                        @if (action.icon) {
                          <i [class]="action.icon + ' mr-1'" aria-hidden="true"></i>
                        }
                        {{ action.label }}
                      </button>
                    }
                    <button type="button" class="p-button p-button-text p-button-sm" (click)="markRead(n.id)">
                      Mark read
                    </button>
                    <p-button
                      icon="pi pi-trash"
                      [text]="true"
                      severity="danger"
                      size="small"
                      aria-label="Dismiss notification"
                      (click)="dismiss(n.id)"
                    />
                  </div>
                </div>
              </div>
            </li>
          }
        </ul>
      }
    </p-popover>
  `,
  styles: [
    `
      .notifications-bell-btn {
        position: relative;
      }
      .notifications-bell-badge {
        position: absolute;
        top: -1px;
        right: 1px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.125rem;
        height: 1.125rem;
        padding: 0 0.2rem;
        font-size: 0.6875rem;
        font-weight: 700;
        line-height: 1;
        background: var(--color-error, #d32f2f);
        color: white;
        border-radius: 999px;
        box-sizing: border-box;
      }
      .notifications-panel-header {
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--surface-border);
      }
      .notifications-list {
        max-height: 20rem;
        overflow-y: auto;
        -ms-overflow-style: none;
        scrollbar-width: none;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .notifications-list::-webkit-scrollbar {
        display: none;
      }
      .notifications-list-item {
        padding: 0.75rem 1rem;
      }
      .notifications-item-content {
        flex: 1;
        min-width: 0;
      }
      .notifications-item-body {
        margin-top: 0.25rem;
        color: var(--text-color-secondary);
        font-size: 0.875rem;
        word-break: break-word;
        white-space: pre-wrap;
      }
      .notifications-item-title {
        display: block;
        font-weight: 500;
      }
      a.notifications-item-title {
        color: var(--p-primary-color, var(--primary-color));
        text-decoration: none;
      }
      a.notifications-item-title:hover {
        text-decoration: underline;
      }
      .notifications-item-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-top: 0.25rem;
        flex-wrap: wrap;
      }
      .notifications-item-actions {
        display: flex;
        gap: 0.25rem;
        flex-shrink: 0;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
    `,
  ],
})
export class NotificationsBellComponent implements OnInit, OnDestroy {
  @ViewChild('popover') private popoverRef?: Popover;

  readonly opened = output<void>();

  private readonly api = inject(NotificationsApiService);
  private readonly session = inject(SessionService);
  private readonly cdr = inject(ChangeDetectorRef);

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private static readonly POLL_INTERVAL_MS = 5 * 60 * 1000;

  readonly unreadCount = signal(0);
  readonly notifications = signal<UserNotificationDto[]>([]);
  readonly loading = signal(false);
  readonly actionLoading = signal<string | null>(null);

  ngOnInit(): void {
    void this.session.getReady().then((me) => {
      if (!me) return;
      this.refreshUnreadCount();
      this.startPolling();
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  closePanel(): void {
    this.popoverRef?.hide();
  }

  onPanelShow(): void {
    this.opened.emit();
    this.loadUnread();
    setTimeout(() => this.applyPopoverOffset(), 0);
  }

  linkFor(n: UserNotificationDto): string[] | null {
    const base = this.api.notificationRoute(n);
    return notificationUiRoute(n, base);
  }

  bodyFor(n: UserNotificationDto): string | null {
    return notificationDisplayBody(n.title, n.body);
  }

  actionsFor(n: UserNotificationDto) {
    return notificationUiActions(n);
  }

  onTitleClick(id: string): void {
    this.markRead(id);
    this.popoverRef?.hide();
  }

  refreshUnreadCount(): void {
    this.api.unreadCount().then(
      (res) => {
        this.unreadCount.set(res.count);
        this.cdr.detectChanges();
      },
      () => {},
    );
  }

  private loadUnread(): void {
    this.loading.set(true);
    this.api
      .list({ unreadOnly: true, limit: 100 })
      .then((res) => {
        this.notifications.set(res.notifications);
        this.loading.set(false);
        this.cdr.detectChanges();
      })
      .catch(() => {
        this.loading.set(false);
        this.cdr.detectChanges();
      });
  }

  markRead(id: string): void {
    this.api.markRead(id).then(() => {
      this.notifications.update((list) => list.filter((n) => n.id !== id));
      this.unreadCount.update((c) => Math.max(0, c - 1));
      this.cdr.detectChanges();
    });
  }

  dismiss(id: string): void {
    this.api.dismiss(id).then(() => {
      this.notifications.update((list) => list.filter((n) => n.id !== id));
      this.unreadCount.update((c) => Math.max(0, c - 1));
      this.cdr.detectChanges();
    });
  }

  runAction(n: UserNotificationDto, action: ReturnType<typeof notificationUiActions>[number]): void {
    const key = `${n.id}:${action.id}`;
    this.actionLoading.set(key);
    action
      .run(n, this.api)
      .then(() => {
        this.notifications.update((list) => list.filter((row) => row.id !== n.id));
        this.unreadCount.update((c) => Math.max(0, c - 1));
      })
      .finally(() => {
        this.actionLoading.set(null);
        this.cdr.detectChanges();
      });
  }

  private applyPopoverOffset(): void {
    const overlay =
      this.popoverRef?.container ?? document.querySelector('.notifications-panel');
    if (overlay instanceof HTMLElement) {
      overlay.style.marginLeft = '20px';
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollInterval = setInterval(() => this.refreshUnreadCount(), NotificationsBellComponent.POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
