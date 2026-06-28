import { Component, effect, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { resolveAssetUrl } from '../core/asset-url.util';
import { GlobalSearchComponent } from '../ui/global-search/global-search.component';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, ButtonModule, GlobalSearchComponent],
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
  readonly resolveAssetUrl = resolveAssetUrl;
  userName = input('');
  avatarUrl = input<string | null | undefined>(null);
  signOut = output<void>();
  avatarImageError = false;

  constructor() {
    effect(() => {
      this.avatarUrl();
      this.avatarImageError = false;
    });
  }
}
