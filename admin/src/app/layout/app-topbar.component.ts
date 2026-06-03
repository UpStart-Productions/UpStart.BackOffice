import { Component, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { LayoutService } from './layout.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [RouterLink, ButtonModule],
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
        <a class="layout-topbar-logo" routerLink="/time-entry">
          UpStart
          <small>Back Office</small>
        </a>
      </div>
      <div class="layout-topbar-actions">
        @if (avatarUrl() && !avatarImageError) {
          <img
            [src]="avatarUrl()!"
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
  userName = input('');
  avatarUrl = input<string | null | undefined>(null);
  signOut = output<void>();
  avatarImageError = false;
}
