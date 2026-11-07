import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { AccordionModule } from 'primeng/accordion';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { emailNotificationPrefGroups, type EmailPrefsState } from '../../core/email-notification-pref-rows';
import { NotificationsApiService } from '../../core/notifications-api.service';
import { SessionService } from '../../core/session.service';
import type { NotificationPrefGroupId, NotificationType } from '@upstart/back-office/shared';

@Component({
  selector: 'app-email-notification-prefs',
  standalone: true,
  imports: [FormsModule, AccordionModule, ToggleSwitchModule],
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      .email-prefs-accordion {
        --p-accordion-content-padding: 0.75rem 0 0.25rem;
      }
      .email-pref-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }
      .email-pref-list li {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        font-size: var(--fs-sm);
      }
    `,
  ],
  template: `
    @if (loading()) {
      <p class="text-color-secondary mb-0">Loading…</p>
    } @else if (prefs(); as p) {
      <p-accordion class="email-prefs-accordion" [multiple]="true" [(value)]="openPanels">
        @for (group of groups(); track group.id) {
          <p-accordion-panel [value]="group.id">
            <p-accordion-header>{{ group.label }}</p-accordion-header>
            <p-accordion-content>
              <ul class="email-pref-list">
                @for (row of group.rows; track row.key) {
                  <li>
                    <span>{{ row.label }}</span>
                    <p-toggleswitch
                      size="small"
                      class="small"
                      [ngModel]="prefValue(p, row.key)"
                      (ngModelChange)="setPref(row.key, $event)"
                    />
                  </li>
                }
              </ul>
            </p-accordion-content>
          </p-accordion-panel>
        }
      </p-accordion>
    }
  `,
})
export class EmailNotificationPrefsComponent implements OnInit {
  private readonly api = inject(NotificationsApiService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(MessageService);

  readonly groups = computed(() => emailNotificationPrefGroups(this.session.me()));
  loading = signal(true);
  prefs = signal<EmailPrefsState | null>(null);
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

  prefValue(p: EmailPrefsState, key: NotificationType): boolean {
    return p[key] !== false;
  }

  async load() {
    this.loading.set(true);
    try {
      this.prefs.set(await this.api.emailPreferences());
    } catch {
      this.prefs.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async setPref(key: NotificationType, value: boolean) {
    const prev = this.prefs();
    if (!prev) return;
    this.prefs.set({ ...prev, [key]: value });
    try {
      this.prefs.set(await this.api.setEmailPreferences({ [key]: value }));
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
