import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { filter } from 'rxjs';
import { LayoutService } from './layout.service';

/** Hover delay before collapsed nav labels appear. */
const NAV_TOOLTIP_SHOW_DELAY_MS = 500;
/** Extra gap between icon rail and nav label tooltip. */
const NAV_TOOLTIP_OFFSET_PX = 4;

export type NavLinkItem = { label: string; icon: string; route: string; badge?: number };
export type NavSectionItem = { sectionLabel: string; badge?: number };
export type NavItem = NavLinkItem | NavSectionItem;

type NavGroup = { section: NavSectionItem | null; items: NavLinkItem[] };

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, TooltipModule],
  template: `
    <div class="layout-sidebar" [class.layout-sidebar--compact]="compact()">
      <div class="layout-sidebar-header">
          <button
            type="button"
            class="layout-sidebar-width-toggle"
            (click)="toggleWidth()"
            [attr.aria-label]="compact() ? 'Expand navigation' : 'Collapse navigation to icons'"
            [pTooltip]="compact() ? 'Expand navigation' : 'Collapse to icons'"
            tooltipPosition="right"
            [showDelay]="navTooltipShowDelayMs"
            [positionLeft]="navTooltipOffsetPx"
            tooltipStyleClass="layout-nav-tooltip"
            appendTo="body"
          >
            <i
              class="pi pi-angle-double-left layout-sidebar-width-icon"
              [class.layout-sidebar-width-icon--expand]="compact()"
            ></i>
          </button>
      </div>
      <ul class="layout-menu">
        <li class="layout-root-menuitem">
          <ul>
            @for (group of navGroups(); track trackGroup($index, group)) {
              @if (group.section) {
                <li class="layout-menu-section" role="presentation">
                  @if (!compact()) {
                    <button
                      type="button"
                      class="layout-menu-section-header"
                      (click)="toggleSection(group.section.sectionLabel)"
                      [attr.aria-expanded]="!sectionCollapsed(group.section.sectionLabel)"
                    >
                      <span class="layout-menu-section-label">{{ group.section.sectionLabel }}</span>
                      <span class="layout-menu-section-trailing">
                        @if (group.section.badge) {
                          <span
                            class="count-badge nav-badge nav-badge--section"
                            [attr.aria-label]="group.section.badge + ' waiting'"
                            >{{ group.section.badge > 99 ? '99+' : group.section.badge }}</span
                          >
                        }
                        <i
                          class="pi layout-menu-section-chevron"
                          [class.pi-chevron-down]="!sectionCollapsed(group.section.sectionLabel)"
                          [class.pi-chevron-right]="sectionCollapsed(group.section.sectionLabel)"
                        ></i>
                      </span>
                    </button>
                  }
                </li>
              }
              @if (group.section) {
                <li class="layout-menu-section-items" role="presentation">
                  <div
                    class="layout-nav-section-collapse"
                    [class.is-collapsed]="sectionCollapsed(group.section.sectionLabel)"
                  >
                    <div class="layout-nav-section-collapse-inner">
                      <ul class="layout-menu-section-links">
                        @for (item of group.items; track item.route) {
                          <li>
                            <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
                          </li>
                        }
                      </ul>
                    </div>
                  </div>
                </li>
              } @else {
                @for (item of group.items; track item.route) {
                  <li>
                    <ng-container *ngTemplateOutlet="navLink; context: { $implicit: item }" />
                  </li>
                }
              }
            }
          </ul>
        </li>
      </ul>
    </div>

    <ng-template #navLink let-item>
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
          <span
            class="count-badge nav-badge"
            [class.nav-badge--compact]="compact()"
            [attr.aria-label]="item.badge + ' waiting'"
            >{{ item.badge > 99 ? '99+' : item.badge }}</span
          >
        }
      </a>
    </ng-template>
  `,
  styles: [
    `
      .layout-menuitem-link {
        position: relative;
      }
      .layout-menu-section {
        display: block;
      }
      .layout-menu-section-items {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .layout-menu-section-links {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .layout-nav-section-collapse {
        display: grid;
        grid-template-rows: 1fr;
        transition: grid-template-rows 0.22s ease;
      }
      .layout-nav-section-collapse.is-collapsed {
        grid-template-rows: 0fr;
      }
      .layout-nav-section-collapse-inner {
        overflow: hidden;
        min-height: 0;
      }
      .layout-menu-section-header {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        width: 100%;
        margin: 0;
        padding: 0.15rem 0.5rem 0.4rem 1rem;
        border: none;
        background: none;
        cursor: pointer;
        text-align: left;
        font: inherit;
        color: inherit;
      }
      .layout-menu-section-header:hover .layout-menu-section-label {
        color: rgba(255, 255, 255, 0.65);
      }
      .layout-menu-section-label {
        flex: 1;
        min-width: 0;
        padding: 0;
        font-size: var(--fs-sm);
        font-weight: 600;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.45);
        text-transform: uppercase;
      }
      .layout-menu-section-trailing {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        flex-shrink: 0;
        margin-left: auto;
      }
      .layout-menu-section-chevron {
        font-size: var(--fs-sm);
        color: rgba(255, 255, 255, 0.45);
        transition: transform 0.22s ease;
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
      }
      .layout-sidebar-header {
        display: flex;
        justify-content: flex-end;
        margin: 0 -0.25rem 0.35rem;
        padding-bottom: 0.15rem;
      }
      .layout-sidebar-width-toggle {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        border: none;
        border-radius: var(--content-border-radius);
        background: rgba(255, 255, 255, 0.06);
        color: rgba(255, 255, 255, 0.75);
        cursor: pointer;
      }
      .layout-sidebar-width-toggle:hover {
        background: rgba(255, 255, 255, 0.1);
        color: var(--brand-lime);
      }
      .layout-sidebar-width-icon {
        font-size: var(--fs-md);
        transition: transform 0.22s ease;
      }
      .layout-sidebar-width-icon--expand {
        transform: scaleX(-1);
      }
      .layout-sidebar--compact .layout-sidebar-header {
        justify-content: center;
        margin-left: 0;
        margin-right: 0;
      }
    `,
  ],
})
export class AppSidebarComponent {
  private readonly router = inject(Router);
  private readonly layout = inject(LayoutService);

  navItems = input<NavItem[]>([]);
  /** Icon-only rail (Task Manager mode or user preference). */
  compact = input(false);
  /** Task Manager shell (toggle adjusts rail vs full main nav). */
  taskMode = input(false);

  readonly navTooltipShowDelayMs = NAV_TOOLTIP_SHOW_DELAY_MS;
  readonly navTooltipOffsetPx = NAV_TOOLTIP_OFFSET_PX;

  readonly navGroups = computed(() => {
    const items = this.navItems();
    const groups: NavGroup[] = [];
    let section: NavSectionItem | null = null;
    let buffer: NavLinkItem[] = [];

    const flush = () => {
      if (section || buffer.length) {
        groups.push({ section, items: buffer });
      }
      buffer = [];
    };

    for (const item of items) {
      if ('sectionLabel' in item) {
        flush();
        section = item;
      } else {
        buffer.push(item);
      }
    }
    flush();
    return groups;
  });

  sectionCollapsed(sectionLabel: string): boolean {
    return this.layout.isNavSectionCollapsed(sectionLabel);
  }

  toggleSection(sectionLabel: string): void {
    this.layout.toggleNavSection(sectionLabel);
  }

  toggleWidth(): void {
    if (this.taskMode()) this.layout.toggleTasksNavExpanded();
    else this.layout.toggleNavCompact();
  }

  trackGroup(index: number, group: NavGroup): string {
    return group.section ? `section-${group.section.sectionLabel}-${index}` : `group-${index}`;
  }

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => this.layout.closeMobileMenu());
  }
}
