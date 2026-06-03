import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { AuthStoreService } from '../core/auth-store.service';
import { CognitoAuthService } from '../core/cognito-auth.service';
import { MeResponse, SessionService } from '../core/session.service';
import { AppFooterComponent } from './app-footer.component';
import { AppSidebarComponent, NavItem } from './app-sidebar.component';
import { AppTopbarComponent } from './app-topbar.component';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [NgClass, RouterOutlet, AppTopbarComponent, AppSidebarComponent, AppFooterComponent],
  templateUrl: './shell.component.html',
})
export class ShellComponent implements OnInit {
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly layout = inject(LayoutService);

  me = signal<MeResponse | null>(null);

  navItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [
      { label: 'Time', icon: 'pi-clock', route: '/time-entry' },
      { label: 'Invoices', icon: 'pi-receipt', route: '/invoices' },
      { label: 'Clients', icon: 'pi-users', route: '/clients' },
      { label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
    ];
    if (this.me()?.isSuper) {
      items.push({ label: 'Users', icon: 'pi-user-edit', route: '/users' });
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
    const me = await this.session.getReady();
    if (me) this.me.set(me);
  }

  get displayName(): string {
    const m = this.me();
    if (!m) return '';
    if (m.firstName || m.lastName) return `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim();
    return m.email;
  }

  async signOut() {
    this.auth.clear();
    this.session.reset();
    if (this.cognito.useCognito) await this.cognito.signOut();
    else this.router.navigate(['/login']);
  }

  onMaskClick() {
    this.layout.closeMobileMenu();
  }
}
