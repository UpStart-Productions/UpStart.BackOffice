import { NgClass } from '@angular/common';
import { Component, computed, effect, inject, OnInit, untracked } from '@angular/core';
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
import { FormWorkspaceSidebarComponent } from '../ui/form-workspace/form-workspace-sidebar.component';
import { CareApi } from '../core/care.api';
import { CommunicationsApi } from '../core/communications.api';
import { HelpAgentWidgetComponent } from '../ui/help-agent-widget/help-agent-widget.component';
import { AppUpdateService } from '../core/app-update.service';

/** Routes rendered in the form workspace (icon rail + the form's sidebar): a form and its submissions. */
export function isFormWorkspaceUrl(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return /^\/forms\/(?!submissions(\/|$))[^/]+(\/submissions)?\/?$/.test(path);
}

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
    FormWorkspaceSidebarComponent,
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
  private readonly care = inject(CareApi);
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
  /** Form workspace: the same rail, with the form's sidebar (Settings, sections, Links, Submissions). */
  readonly formMode = computed(() => isFormWorkspaceUrl(this.currentUrl()));
  /** Either workspace: the main menu becomes a rail and a second column sits beside it. */
  readonly workspaceMode = computed(() => this.taskMode() || this.formMode());

  /** Icon rail on Task Manager routes unless expanded; same preference elsewhere. */
  readonly navCompact = computed(() =>
    this.workspaceMode() ? !this.layout.tasksNavExpanded() : this.layout.navCompact(),
  );

  private readonly syncNavPrefsUser = effect(() => {
    const id = this.session.me()?.id ?? null;
    untracked(() => this.layout.setPrefsUserId(id));
  });
  /** A Tasks-only role (like Guest): the menu is just Tasks. */
  readonly isTasksOnly = computed(() => tasksOnly(this.session.me()));
  readonly canInbox = computed(() => !!areaLevel(this.session.me(), 'inbox'));
  readonly canContacts = computed(() => !!areaLevel(this.session.me(), 'contacts'));
  readonly canCare = computed(() => !!areaLevel(this.session.me(), 'care'));

  /** Keep the Activity badge fresh: refresh my To do count after every navigation. */
  private readonly refreshInboxCount = effect(() => {
    this.currentUrl();
    if (this.canInbox()) void this.comms.refreshActivityCount();
    if (this.canContacts()) void this.comms.refreshReviewCount();
    if (this.canCare()) void this.care.refreshPendingCount();
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
        { area: 'inbox', label: 'Activity', icon: 'pi-comments', route: '/activity', badge: this.comms.activityCount() },
        { area: 'pipeline', label: 'Pipeline', icon: 'square-kanban', lucide: true, route: '/pipeline' },
        { area: 'clients', label: 'Organizations', icon: 'pi-building', route: '/organizations' },
        { area: 'contacts', label: 'People', icon: 'pi-address-book', route: '/people', badge: this.comms.reviewCount() },
        { area: 'bookings', label: 'Bookings', icon: 'pi-calendar', route: '/bookings' },
      ]),
      ...section('Office', [
        { area: 'clients', label: 'Clients', icon: 'pi-users', route: '/clients' },
        { area: 'projects', label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
        { area: 'tasks', label: 'Tasks', icon: 'pi-check-square', route: '/tasks' },
        { area: 'time', label: 'Time', icon: 'pi-clock', route: '/time-entry' },
        { area: 'expenses', label: 'Expenses', icon: 'pi-wallet', route: '/expenses' },
        { area: 'invoices', label: 'Invoices', icon: 'pi-receipt', route: '/invoices' },
        { area: 'forms', label: 'Forms', icon: 'pi-file-edit', route: '/forms' },
      ]),
      // Care module: intake, care profiles, visits and the schedule.
      ...section('Care', [
        { area: 'care', label: 'Intake', icon: 'pi-inbox', route: '/care/intake', badge: this.care.pendingCount() },
        { area: 'care', label: 'Care profiles', icon: 'pi-id-card', route: '/care/profiles' },
        { area: 'visits', label: 'Visits', icon: 'pi-map-marker', route: '/care/visits' },
        { area: 'schedule', label: 'Schedule', icon: 'pi-calendar-clock', route: '/care/schedule' },
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
      // Task mode classes lay out both workspaces (rail + second column), see _task-manager-shell.scss.
      'layout-task-mode': this.workspaceMode(),
      'layout-task-main-nav-expanded': this.workspaceMode() && this.layout.tasksNavExpanded(),
      'layout-nav-compact': this.navCompact() && !this.workspaceMode(),
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
