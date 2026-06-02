import { NgClass } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthStoreService } from '../core/auth-store.service';
import { CognitoAuthService } from '../core/cognito-auth.service';
import { MeResponse, WorkspaceService } from '../core/workspace.service';
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
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  readonly layout = inject(LayoutService);

  me = signal<MeResponse | null>(null);
  flushMain = signal(false);

  navItems: NavItem[] = [
    { label: 'Time', icon: 'pi-clock', route: '/time-entry' },
    { label: 'Invoices', icon: 'pi-file-invoice', route: '/invoices' },
    { label: 'Clients', icon: 'pi-users', route: '/clients' },
    { label: 'Projects', icon: 'pi-briefcase', route: '/projects' },
  ];

  containerClass = computed(() => {
    const state = this.layout.layoutState();
    return {
      'layout-static': true,
      'layout-static-inactive': state.staticMenuDesktopInactive,
      'layout-mobile-active': state.mobileMenuActive,
    };
  });

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.flushMain.set(this.router.url.startsWith('/time-entry'));
      });
  }

  async ngOnInit() {
    this.flushMain.set(this.router.url.startsWith('/time-entry'));
    const me = await this.workspace.getReady();
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
    if (this.cognito.useCognito) await this.cognito.signOut();
    else this.router.navigate(['/login']);
  }

  onMaskClick() {
    this.layout.closeMobileMenu();
  }
}
