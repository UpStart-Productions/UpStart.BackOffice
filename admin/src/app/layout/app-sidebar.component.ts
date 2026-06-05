import { Component, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';

export type NavItem =
  | { label: string; icon: string; route: string }
  | { divider: true };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="layout-sidebar">
      <ul class="layout-menu">
        <li class="layout-root-menuitem">
          <ul>
            @for (item of navItems(); track trackItem($index, item)) {
              @if ('divider' in item) {
                <li class="layout-menu-divider" role="separator" aria-hidden="true"></li>
              } @else {
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

  trackItem(index: number, item: NavItem): string {
    return 'divider' in item ? `divider-${index}` : item.route;
  }

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.layout.closeMobileMenu());
  }
}
