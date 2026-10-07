import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { AppDialogModule } from '../../core/app-dialog.module';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TmApiService } from '../core/tm-api.service';
import { relativeTime } from '../core/tm-format.util';
import { TmStoreService } from '../core/tm-store.service';
import { AppNotification, EmailPrefs } from '../core/tm.types';

const TYPE_ICON: Record<string, string> = {
  task_assigned: 'pi-user-plus',
  task_mention: 'pi-at',
  task_comment: 'pi-comment',
  task_completed: 'pi-check-circle',
  project_added: 'pi-users',
};

/** Notification inbox (Asana-style): activity / archive, mark read, email settings. */
@Component({
  selector: 'app-tm-inbox-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, AppDialogModule, SelectButtonModule, ToggleSwitchModule],
  template: `
    <div class="tm-page tm-inbox">
      <header class="tm-project-header">
        <div class="tm-project-title-row">
          <span class="tm-page-icon"><i class="pi pi-inbox"></i></span>
          <h1 class="tm-project-title">Inbox</h1>
          <div class="tm-project-header-actions">
            <p-selectButton [options]="tabs" optionLabel="label" optionValue="value" [ngModel]="tab()" (ngModelChange)="setTab($event)" [allowEmpty]="false" />
            @if (tab() === 'activity' && unread() > 0) {
              <p-button label="Mark all read" icon="pi pi-check" severity="secondary" [outlined]="true" (onClick)="markAllRead()" />
            }
            <button type="button" class="tm-icon-btn" (click)="openPrefs()" aria-label="Notification settings"><i class="pi pi-cog"></i></button>
          </div>
        </div>
      </header>

      @if (loading() && !items().length) {
        <div class="tm-page-loading"><i class="pi pi-spin pi-spinner"></i></div>
      } @else {
        <ul class="tm-inbox-list">
          @for (n of visible(); track n.id) {
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
              @if (tab() === 'activity') {
                <div class="tm-inbox-actions" (click)="$event.stopPropagation()">
                  <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="toggleRead(n)" [attr.aria-label]="n.readAt ? 'Mark unread' : 'Mark read'" [title]="n.readAt ? 'Mark unread' : 'Mark read'">
                    <i class="pi" [class.pi-eye-slash]="!!n.readAt" [class.pi-eye]="!n.readAt"></i>
                  </button>
                  <button type="button" class="tm-icon-btn tm-icon-btn-sm" (click)="archive(n)" aria-label="Archive" title="Archive"><i class="pi pi-box"></i></button>
                </div>
              }
            </li>
          } @empty {
            <li class="tm-empty-state">
              <i class="pi pi-inbox"></i>
              <p>{{ tab() === 'activity' ? "You're all caught up." : 'Nothing archived yet.' }}</p>
            </li>
          }
        </ul>
      }
    </div>

    <p-dialog header="Email notifications" [(visible)]="prefsOpen" [modal]="true" [style]="{ width: '26rem' }" [draggable]="false">
      @if (prefs(); as p) {
        <p class="tm-muted">In-app notifications always appear here. Choose which ones also send an email.</p>
        <ul class="tm-pref-list">
          @for (row of prefRows; track row.key) {
            <li>
              <span>{{ row.label }}</span>
              <p-toggleswitch [ngModel]="p[row.key]" (ngModelChange)="setPref(row.key, $event)" />
            </li>
          }
        </ul>
      }
    </p-dialog>
  `,
})
export class InboxPage implements OnInit {
  private readonly api = inject(TmApiService);
  private readonly store = inject(TmStoreService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  readonly tabs = [
    { label: 'Activity', value: 'activity' },
    { label: 'Archive', value: 'archive' },
  ];
  readonly prefRows: { key: keyof EmailPrefs; label: string }[] = [
    { key: 'task_assigned', label: 'A task is assigned to me' },
    { key: 'task_mention', label: 'Someone @mentions me' },
    { key: 'task_comment', label: 'Comments on tasks I follow' },
    { key: 'task_completed', label: 'Tasks I follow are completed' },
    { key: 'project_added', label: "I'm added to a project" },
  ];
  readonly relativeTime = relativeTime;

  tab = signal<'activity' | 'archive'>('activity');
  items = signal<AppNotification[]>([]);
  archived = signal<AppNotification[]>([]);
  loading = signal(true);
  prefsOpen = false;
  prefs = signal<EmailPrefs | null>(null);

  readonly unread = computed(() => this.items().filter((n) => !n.readAt).length);
  readonly visible = computed(() => {
    if (this.tab() === 'activity') return this.items();
    const active = new Set(this.items().map((n) => n.id));
    return this.archived().filter((n) => !active.has(n.id));
  });

  ngOnInit() {
    void this.load();
  }

  icon(type: string) {
    return TYPE_ICON[type] ?? 'pi-bell';
  }

  async load() {
    this.loading.set(true);
    try {
      const [active, all] = await Promise.all([this.api.notifications(), this.api.notifications(true)]);
      this.items.set(active.notifications);
      this.archived.set(all.notifications);
      this.store.unreadCount.set(this.unread());
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: 'activity' | 'archive') {
    this.tab.set(tab);
    if (tab === 'archive') void this.load();
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

  async archive(n: AppNotification) {
    this.items.update((list) => list.filter((x) => x.id !== n.id));
    this.store.unreadCount.set(this.unread());
    try {
      await this.api.archiveNotification(n.id);
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

  async openPrefs() {
    this.prefsOpen = true;
    if (!this.prefs()) {
      try {
        this.prefs.set((await this.api.emailPrefs()).email);
      } catch {
        /* ignore */
      }
    }
  }

  async setPref(key: keyof EmailPrefs, value: boolean) {
    const p = this.prefs();
    if (!p) return;
    this.prefs.set({ ...p, [key]: value });
    try {
      this.prefs.set((await this.api.setEmailPrefs({ [key]: value })).email);
    } catch (err) {
      this.prefs.set(p);
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message : String(err) });
    }
  }
}
