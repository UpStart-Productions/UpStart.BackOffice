import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, OnInit } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppConfirmDialogModule } from '../core/app-dialog.module';
import { ToastModule } from 'primeng/toast';
import { AuthStoreService } from '../core/auth-store.service';
import { SessionService } from '../core/session.service';
import { AppFooterComponent } from './app-footer.component';
import { AppSidebarComponent, NavItem } from './app-sidebar.component';
import { AppTopbarComponent } from './app-topbar.component';
import { InvoiceSendDialogComponent } from '../pages/invoices/invoice-send-dialog.component';
import { InvoiceMarkPaidDialogComponent } from '../pages/invoices/invoice-mark-paid-dialog.component';
import { LayoutService } from './layout.service';
import { areaLevel, tasksOnly, type PermissionArea } from '@upstart/back-office/shared';
import { TaskManagerStyleHostComponent } from '../task-manager/ui/task-manager-style-host.component';
import { TmSidebarComponent } from '../task-manager/ui/tm-sidebar.component';
import { CommunicationsApi } from '../core/communications.api';
import { HelpAgentWidgetComponent } from '../ui/help-agent-widget/help-agent-widget.component';
import { AppUpdateService } from '../core/app-update.service';

/** Routes rendered in Task Manager mode (icon rail + task sidebar). */
export function isTaskManagerUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return /^\/tasks(\/|$)/.test(path);
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    NgClass,
    RouterOutlet,
    AppConfirmDialogModule,
    ToastModule,
    AppTopbarComponent,
    AppSidebarComponent,
    AppFooterComponent,
    TaskManagerStyleHostComponent,
    TmSidebarComponent,
    InvoiceSendDialogComponent,
    InvoiceMarkPaidDialogComponent,
    HelpAgentWidgetComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  protected readonly auth = inject(AuthStoreService);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly comms = inject(CommunicationsApi);
  private readonly appUpdate = inject(AppUpdateService);
  readonly layout = inject(LayoutService);

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /** Task Manager mode: main menu shrinks to an icon rail and the task sidebar takes over. */
  readonly taskMode = computed(() => isTaskManagerUrl(this.currentUrl()));
  /** A Tasks-only role (like Guest): the menu is just Tasks. */
  readonly isTasksOnly = computed(() => tasksOnly(this.session.me()));
  readonly canInbox = computed(() => !!areaLevel(this.session.me(), 'inbox'));
  readonly canContacts = computed(() => !!areaLevel(this.session.me(), 'contacts'));

  /** Keep the Inbox badge fresh: refresh the unfiled count after every navigation. */
  private readonly refreshInboxCount = effect(() => {
    this.currentUrl();
    if (this.canInbox()) void this.comms.refreshUnfiledCount();
    if (this.canContacts()) void this.comms.refreshReviewCount();
  });

  navItems = computed<NavItem[]>(() => {
    if (this.isTasksOnly()) {
      return [
        { label: 'Tasks', icon: 'pi-check-square', route: '/tasks' },
      ];
    }
    const me = this.session.me();
    // Admins see everything; other users see only the areas their tenant role grants (any level).
    const can = (area: PermissionArea) => !!areaLevel(me, area);
    const section = (label: string, entries: Array<NavItem & { area: PermissionArea }>, badge?: number): NavItem[] => {
      const visible = entries.filter((e) => can(e.area)).map(({ area: _area, ...item }) => item);
      return visible.length ? [{ sectionLabel: label, ...(badge ? { badge } : {}) }, ...visible] : [];
    };
    const items: NavItem[] = [
      { label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
      // CRM is relationships: opportunities (Pipeline), every organization and person, bookings and the
      // unfiled-email queue. Office is the work: Clients (current clients), projects, time and billing.
      ...section('CRM', [
        { area: 'pipeline', label: 'Pipeline', icon: 'pi-chart-bar', route: '/pipeline' },
        { area: 'clients', label: 'Organizations', icon: 'pi-building', route: '/organizations' },
        { area: 'contacts', label: 'People', icon: 'pi-address-book', route: '/people', badge: this.comms.reviewCount() },
        { area: 'inbox', label: 'Inbox', icon: 'pi-inbox', route: '/inbox', badge: this.comms.unfiledCount() },
        { area: 'bookings', label: 'Bookings', icon: 'pi-calendar', route: '/bookings' },
      ]),
      ...section('Office', [
        { area: 'clients', label: 'Clients', icon: 'pi-users', route: '/clients' },
        { area: 'projects', label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
        { area: 'tasks', label: 'Tasks', icon: 'pi-check-square', route: '/tasks' },
        { area: 'time', label: 'Time', icon: 'pi-clock', route: '/time-entry' },
        { area: 'expenses', label: 'Expenses', icon: 'pi-wallet', route: '/expenses' },
        { area: 'invoices', label: 'Invoices', icon: 'pi-receipt', route: '/invoices' },
      ]),
      ...section('Reports', [{ area: 'reports', label: 'Reports', icon: 'pi-chart-line', route: '/reports' }]),
    ];
    if (me?.role === 'ADMIN') {
      items.push({ sectionLabel: 'Accounting' });
      items.push({ label: 'Chart of Accounts', icon: 'pi-book', route: '/accounting/accounts' });
      items.push({ label: 'Journal', icon: 'pi-list', route: '/accounting/journal' });
      items.push({ label: 'Bank Import', icon: 'pi-building-columns', route: '/accounting/bank-import' });
      items.push({ label: 'Accounting Reports', icon: 'pi-chart-pie', route: '/accounting/reports' });
      items.push({ sectionLabel: 'Admin' });
      items.push({ label: 'Users', icon: 'pi-user-edit', route: '/users' });
      items.push({ label: 'Settings', icon: 'pi-cog', route: '/settings' });
      if (this.session.me()?.isSuper) {
        items.push({ label: 'Tenants', icon: 'pi-building', route: '/tenants' });
        items.push({ label: 'Guide setup', icon: 'pi-sparkles', route: '/platform/help-assistant' });
      }
    }
    return items;
  });

  containerClass = computed(() => {
    const state = this.layout.layoutState();
    return {
      'layout-static': true,
      'layout-static-inactive': state.staticMenuDesktopInactive,
      'layout-mobile-active': state.mobileMenuActive,
      'layout-task-mode': this.taskMode(),
      'has-impersonation-banner': !!this.auth.impersonatedUserId,
    };
  });

  async ngOnInit() {
    await this.session.getReady();
    this.appUpdate.showPostReloadToast();
  }

  onMaskClick() {
    this.layout.closeMobileMenu();
  }
}
