import { Component, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';

/** Hover delay before collapsed nav labels appear. */
const NAV_TOOLTIP_SHOW_DELAY_MS = 500;
/** Extra gap between icon rail and nav label tooltip. */
const NAV_TOOLTIP_OFFSET_PX = 4;

export type NavItem =
  | { label: string; icon: string; route: string; badge?: number }
  | { sectionLabel: string; badge?: number };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TooltipModule],
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
                    @if (item.badge) {
                      <span class="nav-badge nav-badge--section" [attr.aria-label]="item.badge + ' waiting'">{{
                        item.badge > 99 ? '99+' : item.badge
                      }}</span>
                    }
                  }
                </li>
              } @else {
                <li>
                  <a
                    [routerLink]="item.route"
                    routerLinkActive="active-route"
                    [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' || item.route === '/time-entry' }"
                    class="layout-menuitem-link"
                    [pTooltip]="item.label"
                    [tooltipDisabled]="!compact()"
                    tooltipPosition="right"
                    [showDelay]="navTooltipShowDelayMs"
                    [positionLeft]="navTooltipOffsetPx"
                    tooltipStyleClass="layout-nav-tooltip"
                    appendTo="body"
                    [attr.aria-label]="compact() ? item.label : null"
                  >
                    <i class="pi layout-menuitem-icon {{ item.icon }}"></i>
                    @if (!compact()) {
                      <span>{{ item.label }}</span>
                    }
                    @if (item.badge) {
                      <span class="nav-badge" [class.nav-badge--compact]="compact()" [attr.aria-label]="item.badge + ' waiting'">{{
                        item.badge > 99 ? '99+' : item.badge
                      }}</span>
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
  styles: [
    `
      .layout-menuitem-link {
        position: relative;
      }
      .layout-menu-section {
        display: flex;
        align-items: flex-start;
        gap: 0.25rem;
      }
      .nav-badge--section {
        margin-left: 0;
        min-width: 1rem;
        font-size: var(--fs-sm);
        line-height: 1rem;
      }
      .nav-badge.nav-badge--compact {
        position: absolute;
        top: 0.15rem;
        right: 0.15rem;
        margin: 0;
        min-width: 1rem;
        padding: 0 0.3rem;
        font-size: var(--fs-sm);
        line-height: 1rem;
      }
      .nav-badge {
        margin-left: auto;
        min-width: 1.25rem;
        padding: 0 0.4rem;
        border-radius: 999px;
        background: var(--p-primary-color, #2563eb);
        color: #fff;
        font-size: var(--fs-sm);
        line-height: 1.25rem;
        text-align: center;
      }
    `,
  ],
})
export class AppSidebarComponent {
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);

  navItems = input<NavItem[]>([]);
  /** Icon-only rail (Task Manager mode). */
  compact = input(false);
  readonly navTooltipShowDelayMs = NAV_TOOLTIP_SHOW_DELAY_MS;
  readonly navTooltipOffsetPx = NAV_TOOLTIP_OFFSET_PX;

  trackItem(index: number, item: NavItem): string {
    return 'sectionLabel' in item ? `section-${item.sectionLabel}-${index}` : item.route;
  }

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.layout.closeMobileMenu());
  }
}
