import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import {
  notificationPrefGroups,
  type ChannelPreferences,
  type NotificationChannel,
  type NotificationPrefGroupId,
  type NotificationType,
} from '@upstart/back-office/shared';
import { NotificationsApiService } from '../../core/notifications-api.service';
import { SessionService } from '../../core/session.service';

@Component({
  selector: 'app-notification-prefs',
  standalone: true,
  imports: [FormsModule, AccordionModule, ToggleSwitchModule],
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .notification-prefs-accordion {
        --p-accordion-content-padding: 0.75rem 0 0.25rem;
      }
      .notification-pref-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--fs-sm);
      }
      .notification-pref-table th {
        font-weight: 600;
        text-align: center;
        padding: 0 0.35rem 0.5rem;
        color: var(--text-color-secondary);
        font-size: var(--fs-xs);
      }
      .notification-pref-table th:first-child {
        text-align: left;
        width: 100%;
      }
      .notification-pref-table td {
        padding: 0.5rem 0.35rem;
        vertical-align: middle;
      }
      .notification-pref-table td:not(:first-child) {
        text-align: center;
        width: 3.25rem;
      }
      .notification-pref-table tr + tr td {
        border-top: 1px solid var(--surface-border);
      }
    `,
  ],
  template: `
    @if (loading()) {
      <p class="text-color-secondary mb-0">Loading…</p>
    } @else if (prefs(); as p) {
      <p-accordion class="notification-prefs-accordion" [multiple]="true" [(value)]="openPanels">
        @for (group of groups(); track group.id) {
          <p-accordion-panel [value]="group.id">
            <p-accordion-header>{{ group.label }}</p-accordion-header>
            <p-accordion-content>
              <table class="notification-pref-table">
                <thead>
                  <tr>
                    <th scope="col"></th>
                    <th scope="col">In-app</th>
                    <th scope="col">Email</th>
                  </tr>
                </thead>
                <tbody>
                  @for (row of group.rows; track row.key) {
                    <tr>
                      <td>{{ row.label }}</td>
                      <td>
                        <p-toggleswitch
                          size="small"
                          class="small"
                          [ngModel]="channelValue(p, row.key, 'inApp')"
                          (ngModelChange)="setChannel(row.key, 'inApp', $event)"
                        />
                      </td>
                      <td>
                        <p-toggleswitch
                          size="small"
                          class="small"
                          [ngModel]="channelValue(p, row.key, 'email')"
                          (ngModelChange)="setChannel(row.key, 'email', $event)"
                        />
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </p-accordion-content>
          </p-accordion-panel>
        }
      </p-accordion>
    }
  `,
})
export class NotificationPrefsComponent implements OnInit {
  private readonly api = inject(NotificationsApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  readonly groups = computed(() => notificationPrefGroups(this.session.me()));
  loading = signal(true);
  prefs = signal<ChannelPreferences | null>(null);
  openPanels = signal<NotificationPrefGroupId[]>([]);

  constructor() {
    effect(() => {
      const ids = new Set(this.groups().map((g) => g.id));
      untracked(() => {
        this.openPanels.update((cur) => cur.filter((id) => ids.has(id)));
      });
    });
  }

  ngOnInit() {
    void this.load();
  }

  channelValue(p: ChannelPreferences, key: NotificationType, channel: NotificationChannel): boolean {
    return p[key][channel];
  }

  async load() {
    this.loading.set(true);
    try {
      this.prefs.set(await this.api.channelPreferences());
    } catch {
      this.prefs.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async setChannel(key: NotificationType, channel: NotificationChannel, value: boolean) {
    const prev = this.prefs();
    if (!prev) return;
    this.prefs.set({
      ...prev,
      [key]: { ...prev[key], [channel]: value },
    });
    try {
      this.prefs.set(await this.api.setChannelPreferences({ [key]: { [channel]: value } }));
    } catch (err) {
      this.prefs.set(prev);
      this.toast.add({
        severity: 'error',
        summary: 'Could not save',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
