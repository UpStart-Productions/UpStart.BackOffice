import { Component, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';

export type NavItem = { label: string; icon: string; route: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="layout-sidebar">
      <ul class="layout-menu">
        <li class="layout-root-menuitem">
          <div class="layout-menuitem-root-text">Menu</div>
          <ul>
            @for (item of navItems(); track item.route) {
              <li>
                <a
                  [routerLink]="item.route"
                  routerLinkActive="active-route"
                  [routerLinkActiveOptions]="{ exact: item.route === '/time-entry' }"
                  class="layout-menuitem-link"
                >
                  <i class="pi layout-menuitem-icon {{ item.icon }}"></i>
                  <span>{{ item.label }}</span>
                </a>
              </li>
            }
          </ul>
        </li>
      </ul>
    </div>
  `,
})
export class AppSidebarComponent {
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);

  navItems = input<NavItem[]>([]);

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.layout.closeMobileMenu());
  }
}
