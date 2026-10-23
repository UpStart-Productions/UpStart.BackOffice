import { Component, effect, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { resolveAssetUrl } from '../core/asset-url.util';
import { TenantService } from '../core/tenant.service';
import { GlobalSearchComponent } from '../ui/global-search/global-search.component';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, FormsModule, ButtonModule, SelectModule, GlobalSearchComponent],
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
      <div class="layout-topbar-search">
        <app-global-search />
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
            styleClass="topbar-tenant-select"
          />
        }
        @if (avatarUrl() && !avatarImageError) {
          <img
            [src]="resolveAssetUrl(avatarUrl())!"
            alt=""
            class="topbar-user-avatar"
            referrerpolicy="no-referrer"
            (error)="avatarImageError = true"
          />
        }
        @if (userName()) {
          <span class="topbar-user-name">{{ userName() }}</span>
        }
        <button
          pButton
          type="button"
          label="Sign out"
          severity="secondary"
          size="small"
          (click)="signOut.emit()"
        ></button>
      </div>
    </div>
  `,
})
export class AppTopbarComponent {
  readonly layout = inject(LayoutService);
  readonly tenant = inject(TenantService);
  readonly resolveAssetUrl = resolveAssetUrl;
  userName = input('');
  avatarUrl = input<string | null | undefined>(null);
  signOut = output<void>();
  avatarImageError = false;

  constructor() {
    void this.tenant.load().catch(() => undefined);
    effect(() => {
      this.avatarUrl();
      this.avatarImageError = false;
    });
  }
}
