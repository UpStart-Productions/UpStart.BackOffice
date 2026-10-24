import { NgClass } from '@angular/common';
import { Component, effect, inject, OnInit, signal, viewChild, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { Menu, MenuModule } from 'primeng/menu';
import { RippleModule } from 'primeng/ripple';
import { SelectModule } from 'primeng/select';
import { roleLabel } from '@upstart/back-office/shared';
import { resolveAssetUrl } from '../core/asset-url.util';
import { AuthStoreService } from '../core/auth-store.service';
import { CognitoAuthService } from '../core/cognito-auth.service';
import { SessionService } from '../core/session.service';
import { TenantService } from '../core/tenant.service';
import { GlobalSearchComponent } from '../ui/global-search/global-search.component';
import { HelpDrawerComponent } from '../ui/help-drawer/help-drawer.component';
import { NotificationsBellComponent } from '../ui/notifications-bell/notifications-bell.component';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    SelectModule,
    MenuModule,
    RippleModule,
    GlobalSearchComponent,
    NotificationsBellComponent,
    HelpDrawerComponent,
    NgClass,
  ],
  styles: [
    `
      .user-menu-header {
        border-bottom: 1px solid var(--surface-border);
      }
      .user-menu-role {
        font-size: 0.875rem;
        color: var(--text-color-secondary);
      }
      .topbar-user-menu-btn {
        width: 45px;
        height: 45px;
        min-width: 45px;
        padding: 0;
        border-radius: 50%;
      }
      .topbar-user-menu-btn:hover {
        background-color: transparent;
      }
      .topbar-user-avatar {
        width: 45px;
        height: 45px;
        border-radius: 50%;
        object-fit: cover;
        display: block;
        flex-shrink: 0;
      }
      .topbar-user-avatar--placeholder {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--surface-100, #e8eaed);
        color: var(--text-color-secondary);
      }
      .topbar-user-avatar--placeholder .pi {
        font-size: 1.25rem;
      }
    `,
  ],
  template: `
    <div class="layout-topbar">
      <div class="layout-topbar-logo-container">
        <button
          type="button"
          class="layout-menu-button layout-topbar-action"
          (click)="layout.onMenuToggle()"
          aria-label="Open menu"
        >
          <i class="pi pi-bars"></i>
        </button>
        <a class="layout-topbar-logo" routerLink="/dashboard">
          <img
            src="/images/upstart-logo-dark.svg"
            alt="UpStart Back Office"
            class="topbar-logo-img"
            width="160"
            height="49"
          />
        </a>
      </div>
      <div class="layout-topbar-actions">
        @if (tenant.canSwitch()) {
          <p-select
            [options]="tenant.tenants()"
            optionLabel="name"
            optionValue="slug"
            [ngModel]="tenant.currentSlug()"
            (onChange)="tenant.switchTo($event.value)"
            ariaLabel="Switch tenant"
            size="small"
            styleClass="topbar-tenant-select topbar-action-mobile-hidden"
          />
        }
        <app-global-search (opened)="onGlobalSearchOpened()" />
        @defer (when helpRequested()) {
          <app-help-drawer />
        }
        <button
          type="button"
          class="layout-topbar-action"
          (click)="closeTopbarOverlays(); onHelpClick()"
          aria-label="Help for this page"
          title="Help for this page"
        >
          <i class="pi pi-question-circle"></i>
        </button>
        <app-notifications-bell (opened)="onNotificationsOpened()" />
        <div class="layout-topbar-action-wrap">
          <button
            type="button"
            class="layout-topbar-action topbar-user-menu-btn"
            (click)="closeTopbarOverlays(); userMenu.toggle($event)"
            aria-label="User menu"
            aria-haspopup="true"
          >
            @if (avatarSrc && !avatarImageError) {
              <img
                [src]="avatarSrc"
                alt=""
                class="topbar-user-avatar"
                referrerpolicy="no-referrer"
                (error)="avatarImageError = true"
              />
            } @else {
              <span class="topbar-user-avatar topbar-user-avatar--placeholder" aria-hidden="true">
                <i class="pi pi-user"></i>
              </span>
            }
          </button>
          <p-menu
            #userMenu
            [model]="userMenuItems"
            [popup]="true"
            appendTo="body"
            styleClass="user-menu-popover"
          >
            <ng-template pTemplate="start">
              <div class="user-menu-header p-3">
                @if (isImpersonating()) {
                  <p class="mb-2 mt-0"><strong>Impersonating</strong></p>
                }
                <h5 class="mt-0 mb-1">{{ displayName() }}</h5>
                <span class="user-menu-role">{{ roleSubtitle() }}</span>
                <div class="mt-2 text-sm">{{ email() }}</div>
              </div>
            </ng-template>
            <ng-template pTemplate="item" let-item>
              @if (item.command) {
                <a
                  pRipple
                  class="p-menuitem-link"
                  (click)="item.command!({ originalEvent: $event, item }); userMenu.hide()"
                >
                  <i [ngClass]="item.icon" class="p-menuitem-icon"></i>
                  <span class="p-menuitem-text">{{ item.label }}</span>
                </a>
              }
            </ng-template>
          </p-menu>
        </div>
      </div>
    </div>
  `,
})
export class AppTopbarComponent implements OnInit {
  readonly layout = inject(LayoutService);
  readonly tenant = inject(TenantService);
  protected readonly session = inject(SessionService);
  private readonly auth = inject(AuthStoreService);
  private readonly cognito = inject(CognitoAuthService);
  private readonly router = inject(Router);

  private readonly globalSearchRef = viewChild(GlobalSearchComponent);
  @ViewChild(NotificationsBellComponent) private notificationsBell?: NotificationsBellComponent;
  @ViewChild('userMenu') private userMenu?: Menu;

  avatarImageError = false;
  userMenuItems: MenuItem[] = [];

  /** The help drawer (and its article content) loads on first click of the ? button. */
  protected readonly helpRequested = signal(false);
  private helpDrawerInstance?: HelpDrawerComponent;
  private pendingHelpOpen = false;

  @ViewChild(HelpDrawerComponent) set helpDrawer(component: HelpDrawerComponent | undefined) {
    this.helpDrawerInstance = component;
    if (component && this.pendingHelpOpen) {
      this.pendingHelpOpen = false;
      queueMicrotask(() => component.open());
    }
  }

  get avatarSrc(): string | null {
    return resolveAssetUrl(this.session.me()?.avatarUrl ?? null);
  }

  constructor() {
    void this.tenant.load().catch(() => undefined);
    effect(() => {
      this.session.me();
      this.auth.impersonatedUserId;
      this.tenant.currentSlug();
      this.avatarImageError = false;
      this.userMenuItems = this.buildUserMenuItems();
    });
  }

  ngOnInit(): void {
    this.userMenuItems = this.buildUserMenuItems();
  }

  closeTopbarOverlays(): void {
    this.globalSearchRef()?.close();
    this.userMenu?.hide();
    this.notificationsBell?.closePanel();
  }

  onGlobalSearchOpened(): void {
    this.userMenu?.hide();
    this.notificationsBell?.closePanel();
  }

  onNotificationsOpened(): void {
    this.globalSearchRef()?.close();
    this.userMenu?.hide();
    this.helpDrawerInstance?.close();
  }

  onHelpClick(): void {
    if (this.helpDrawerInstance) {
      this.helpDrawerInstance.toggle();
      return;
    }
    this.pendingHelpOpen = true;
    this.helpRequested.set(true);
  }

  protected isImpersonating(): boolean {
    return !!this.auth.impersonatedUserId?.trim();
  }

  displayName(): string {
    const m = this.session.me();
    if (!m) return this.auth.baseEmail || '';
    const first = m.firstName?.trim();
    const last = m.lastName?.trim();
    if (first || last) return [first, last].filter(Boolean).join(' ');
    if (m.name?.trim()) return m.name.trim();
    return m.email;
  }

  email(): string {
    return this.session.me()?.email?.trim() || this.auth.baseEmail || '';
  }

  roleSubtitle(): string {
    const m = this.session.me();
    if (!m) return '';

    const rolePart = (() => {
      if (m.isSuper) return 'Super user';
      if (m.role === 'ADMIN') return roleLabel('ADMIN');
      if (m.roleName?.trim()) return m.roleName.trim();
      return roleLabel(m.role);
    })();

    if (m.isSuper) {
      const slug = this.tenant.currentSlug();
      const tenantName = this.tenant.tenants().find((t) => t.slug === slug)?.name;
      if (tenantName) return `${rolePart} · ${tenantName}`;
    }

    return rolePart;
  }

  private buildUserMenuItems(): MenuItem[] {
    const items: MenuItem[] = [];
    if (this.isImpersonating()) {
      items.push({
        label: 'Return to my account',
        icon: 'pi pi-fw pi-undo',
        command: () => this.returnToMyAccount(),
      });
    }
    items.push({
      label: 'Sign out',
      icon: 'pi pi-fw pi-sign-out',
      command: () => void this.signOut(),
    });
    return items;
  }

  private returnToMyAccount(): void {
    this.auth.stopImpersonating();
    window.location.assign('/dashboard');
  }

  private async signOut(): Promise<void> {
    this.auth.clear();
    this.session.reset();
    if (this.cognito.useCognito) await this.cognito.clearLocalSession();
    await this.router.navigate(['/login']);
  }
}
