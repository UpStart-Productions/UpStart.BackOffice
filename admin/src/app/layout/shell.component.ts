import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { AuthStoreService } from '../core/auth-store.service';
import { CognitoAuthService } from '../core/cognito-auth.service';
import { SessionService } from '../core/session.service';
import { AppFooterComponent } from './app-footer.component';
import { AppSidebarComponent, NavItem } from './app-sidebar.component';
import { AppTopbarComponent } from './app-topbar.component';
import { LayoutService } from './layout.service';
import { isAdminRole } from '@upstart/back-office/shared';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    NgClass,
    RouterOutlet,
    ConfirmDialogModule,
    ToastModule,
    AppTopbarComponent,
    AppSidebarComponent,
    AppFooterComponent,
  ],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  protected readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly layout = inject(LayoutService);

  navItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [
      { label: 'Dashboard', icon: 'pi-home', route: '/dashboard' },
      { label: 'Pipeline', icon: 'pi-chart-bar', route: '/pipeline' },
      { label: 'Clients', icon: 'pi-users', route: '/clients' },
      { label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
      { label: 'Time', icon: 'pi-clock', route: '/time-entry' },
      { label: 'Invoices', icon: 'pi-receipt', route: '/invoices' },
      { label: 'Reports', icon: 'pi-chart-line', route: '/reports' },
    ];
    if (isAdminRole(this.session.me()?.role ?? 'MEMBER')) {
      items.push({ divider: true });
      items.push({ label: 'Users', icon: 'pi-user-edit', route: '/users' });
      items.push({ label: 'Settings', icon: 'pi-cog', route: '/settings' });
    }
    return items;
  });

  containerClass = computed(() => {
    const state = this.layout.layoutState();
    return {
      'layout-static': true,
      'layout-static-inactive': state.staticMenuDesktopInactive,
      'layout-mobile-active': state.mobileMenuActive,
    };
  });

  async ngOnInit() {
    await this.session.getReady();
  }

  get displayName(): string {
    const m = this.session.me();
    if (!m) return '';
    if (m.firstName || m.lastName) return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
    return m.email;
  }

  async signOut() {
    this.auth.clear();
    this.session.reset();
    if (this.cognito.useCognito) await this.cognito.clearLocalSession();
    await this.router.navigate(['/login']);
  }

  onMaskClick() {
    this.layout.closeMobileMenu();
  }
}
