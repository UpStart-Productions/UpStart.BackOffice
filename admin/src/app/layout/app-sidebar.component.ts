import { Component, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';

export type NavItem =
  | { label: string; icon: string; route: string }
  | { sectionLabel: string };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <div class="layout-sidebar" [class.layout-sidebar--compact]="compact()">
      <ul class="layout-menu">
        <li class="layout-root-menuitem">
          <ul>
            @for (item of navItems(); track trackItem($index, item)) {
              @if ('sectionLabel' in item) {
                <li class="layout-menu-section" role="presentation">
                  @if (!compact()) {
                    <span class="layout-menu-section-label">{{ item.sectionLabel }}</span>
                  }
                </li>
              } @else {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="active-route"
                    [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/time-entry' }"
                    class="layout-menuitem-link"
                    [attr.title]="compact() ? item.label : null"
                    [attr.aria-label]="compact() ? item.label : null"
                  >
                    <i class="pi layout-menuitem-icon {{ item.icon }}"></i>
                    @if (!compact()) {
                      <span>{{ item.label }}</span>
                    }
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
  /** Icon-only rail (Task Manager mode). */
  compact = input(false);

  trackItem(index: number, item: NavItem): string {
    return 'sectionLabel' in item ? `section-${item.sectionLabel}-${index}` : item.route;
  }

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.layout.closeMobileMenu());
  }
}
