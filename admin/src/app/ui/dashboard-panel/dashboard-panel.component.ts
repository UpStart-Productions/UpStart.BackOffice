import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import { LucideIconComponent } from '@upstart/back-office/lucide-icons';
import { AfterViewInit, Component, ElementRef, input, model, NgZone, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';

/** Icon tile color. No purple: that is reserved for action buttons. */
export type DashboardPanelColor = 'info' | 'success' | 'warning' | 'danger' | 'neutral';

/** One tab in a panel's tab strip. Count uses the shared `.count-badge`. */
export type DashboardPanelTab = {
  id: string;
  label: string;
  count?: number;
  /** Badge color when the count is above zero. Zero uses the muted badge. */
  countTone?: 'info' | 'success' | 'warning' | 'danger';
};

/**
 * A Dashboard panel: card with a header bar (colored icon tile, title, drag handle), an optional tab strip,
 * a body that scrolls once it is about six rows tall, and an arrow in the header to the full list.
 * Place it inside a `cdkDrag` slot; the ⋯ handle is the drag handle. Rows in the body use `.side-list`.
 */
@Component({
  selector: 'app-dashboard-panel',
  // `title` is also a global HTML attribute; clear it so the host doesn't show a browser tooltip.
  host: { '[attr.title]': 'null' },
  standalone: true,
  imports: [CdkDragHandle, NgTemplateOutlet, RouterLink, TooltipModule, LucideIconComponent],
  template: `
    <section class="card dashboard-panel" [attr.aria-label]="title()">
      <header class="dashboard-panel-header" [class.dashboard-panel-header--sky]="!!sky()">
        @if (sky(); as skyKey) {
          <!-- Sky behind the icon tile; grows across the header when the alternate header shows. -->
          <span class="dashboard-panel-sky" [attr.data-sky]="skyKey" [class.dashboard-panel-sky--open]="altShown()" aria-hidden="true">
            <span class="sky-decor">
              <i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i>
              <i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i>
              <i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i><i class="sky-bit"></i>
            </span>
          </span>
        }
        <ng-template #iconContent>
          <ng-content select="[panelIcon]"><i [class]="'pi ' + icon()"></i></ng-content>
        </ng-template>
        @if (iconToggles()) {
          <button
            type="button"
            class="dashboard-panel-icon dashboard-panel-icon--button"
            [attr.data-color]="sky() ? null : color()"
            [attr.data-sky]="sky()"
            [attr.aria-pressed]="altShown()"
            [attr.aria-label]="(iconTooltip() || title()).trim()"
            [pTooltip]="(iconTooltip() || title()).trim()"
            tooltipPosition="bottom"
            [showDelay]="darkTooltipShowDelayMs"
            tooltipStyleClass="ubo-dark-tooltip"
            appendTo="body"
            (click)="altShown.set(!altShown())"
          >
            <ng-container *ngTemplateOutlet="iconContent" />
          </button>
        } @else {
          <span
            class="dashboard-panel-icon"
            [attr.data-color]="sky() ? null : color()"
            aria-hidden="true"
            [pTooltip]="(iconTooltip() || title()).trim()"
            tooltipPosition="bottom"
            [showDelay]="darkTooltipShowDelayMs"
            tooltipStyleClass="dashboard-panel-icon-tooltip"
            appendTo="body"
          >
            <ng-container *ngTemplateOutlet="iconContent" />
          </span>
        }
        <div class="dashboard-panel-heading" [class.dashboard-panel-heading--alt]="altShown()">
          <div class="dashboard-panel-title-row" [attr.aria-hidden]="altShown()">
            <h3 class="dashboard-panel-title">
              {{ title() }}
              @if (subtitle()) {
                <span class="dashboard-panel-subtitle">{{ subtitle() }}</span>
              }
            </h3>
            <!-- Control right after the title (e.g. Financial health's date range). -->
            <ng-content select="[panelTitleTrail]" />
          </div>
          <div class="dashboard-panel-alt" [attr.aria-hidden]="!altShown()">
            <ng-content select="[panelHeaderAlt]" />
          </div>
        </div>
        <ng-content select="[panelActions]" />
        <button
          type="button"
          class="dashboard-panel-handle"
          cdkDragHandle
          aria-label="Drag to move this card"
        >
          <nmp-lucide-icon name="grip-horizontal" aria-hidden="true" />
        </button>
        @if (link(); as l) {
          <a
            class="dashboard-panel-open"
            [routerLink]="l"
            [queryParams]="queryParams()"
            [attr.aria-label]="'Open ' + title()"
            [pTooltip]="'Open ' + title()"
            tooltipPosition="top"
            tooltipStyleClass="ubo-dark-tooltip"
            [showDelay]="darkTooltipShowDelayMs"
            appendTo="body"
          >
            <i class="pi pi-arrow-right" aria-hidden="true"></i>
          </a>
        }
      </header>
      @if (tabs(); as tabList) {
        @if (tabList.length) {
          <div class="dashboard-panel-tabs" role="tablist" [attr.aria-label]="title()">
            @for (tab of tabList; track tab.id) {
              <button
                type="button"
                role="tab"
                class="dashboard-panel-tab"
                [class.dashboard-panel-tab--active]="activeTab() === tab.id"
                [attr.aria-selected]="activeTab() === tab.id"
                (click)="activeTab.set(tab.id)"
              >
                {{ tab.label }}
                @if (tab.count != null) {
                  <span [class]="countClass(tab)">{{ tab.count }}</span>
                }
              </button>
            }
          </div>
        }
      }
      <ng-content select=".dashboard-panel-pinned" />
      <div
        #scroll
        class="dashboard-panel-scroll"
        [class.dashboard-panel-scroll--fill]="fill()"
        [class.dashboard-panel-scroll--fade]="moreBelow()"
        (scroll)="updateFade()"
      >
        <ng-content />
      </div>
    </section>
  `,
  styles: [
    `
      :host {
        /* One inset on every side of a card: header, tabs and body all line up with it. */
        --dashboard-panel-pad: 1.25rem;
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
      }

      .dashboard-panel.card {
        display: flex;
        flex-direction: column;
        flex: 1 1 auto;
        margin: 0;
        min-height: 0;
        padding: var(--dashboard-panel-pad);
        border: 1px solid var(--surface-border);
        transition: box-shadow 0.15s ease;
      }

      .dashboard-panel.card:hover {
        box-shadow: 0 2px 10px rgba(15, 23, 42, 0.06);
      }

      .dashboard-panel-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-shrink: 0;
        margin: 0;
        padding: 0;
      }

      /* The last header button's glyph sits on the card's inset line, like the icon tile on the left. */
      .dashboard-panel-header > :last-child {
        margin-right: -0.625rem;
      }

      /* Header buttons are taller than the icon tile; don't let them push the title row down. */
      .dashboard-panel-handle,
      .dashboard-panel-open {
        margin-block: -0.125rem;
      }

      .dashboard-panel-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 2rem;
        height: 2rem;
        border-radius: 0.5rem;
        background: var(--p-content-hover-background, #f3f4f6);
        color: var(--text-color-secondary);
      }

      .dashboard-panel-icon[data-color='info'] {
        background: var(--color-severity-info-bg);
        color: var(--color-severity-info-text);
      }

      .dashboard-panel-icon[data-color='success'] {
        background: var(--color-severity-success-bg);
        color: var(--color-severity-success-text);
      }

      .dashboard-panel-icon[data-color='warning'] {
        background: var(--color-severity-warning-bg);
        color: var(--color-severity-warning-text);
      }

      .dashboard-panel-icon[data-color='danger'] {
        background: var(--color-severity-danger-bg);
        color: var(--color-severity-danger-text);
      }

      /* Title and the alternate header (e.g. weather) share one spot: one fades out as the other slides in. */
      .dashboard-panel-heading {
        flex: 1 1 auto;
        min-width: 0;
        display: grid;
        align-items: center;
      }

      .dashboard-panel-heading > * {
        grid-area: 1 / 1;
        min-width: 0;
      }

      .dashboard-panel-title-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        min-width: 0;
        transition: opacity 0.2s ease;
      }

      .dashboard-panel-title-row > .dashboard-panel-title {
        flex: 0 1 auto;
      }

      .dashboard-panel-alt {
        opacity: 0;
        transform: translateX(-0.75rem);
        pointer-events: none;
        transition:
          opacity 0.25s ease,
          transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
      }

      .dashboard-panel-heading--alt .dashboard-panel-title-row {
        opacity: 0;
        pointer-events: none;
      }

      .dashboard-panel-heading--alt .dashboard-panel-alt {
        opacity: 1;
        transform: none;
        pointer-events: auto;
      }

      @media (prefers-reduced-motion: reduce) {
        .dashboard-panel-title-row,
        .dashboard-panel-alt {
          transition: none;
        }
      }

      /* With a weather sky behind it, the tile itself has no fill (the sky is its background). */
      .dashboard-panel-icon[data-sky] {
        background: transparent;
      }

      .dashboard-panel-icon--button {
        padding: 0;
        border: 0;
        font: inherit;
        cursor: pointer;
        font-size: 1.15rem;
        transition: filter 0.15s ease;
      }

      .dashboard-panel-icon--button:hover {
        filter: brightness(0.95);
      }

      .dashboard-panel-icon--button:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
      }

      .dashboard-panel-title {
        flex: 1 1 auto;
        min-width: 0;
        margin: 0;
        font-size: var(--fs-md);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .dashboard-panel-subtitle {
        margin-left: 0.5rem;
        font-size: var(--fs-sm);
        font-weight: 400;
        color: var(--text-color-secondary);
      }

      .dashboard-panel-handle {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        padding: 0;
        border: 0;
        background: transparent;
        color: var(--drag-handle-color);
        border-radius: var(--content-border-radius);
        cursor: grab;
      }

      .dashboard-panel-handle nmp-lucide-icon {
        font-size: 1.1rem;
      }

      .dashboard-panel-handle:hover {
        background: var(--p-content-hover-background, #f3f4f6);
      }

      .dashboard-panel-handle:active {
        cursor: grabbing;
      }

      .dashboard-panel-open {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 2.25rem;
        height: 2.25rem;
        border-radius: var(--content-border-radius);
        color: var(--text-color-secondary);
        text-decoration: none;
      }

      .dashboard-panel-open:hover {
        color: var(--text-color);
        background: var(--p-content-hover-background, #f3f4f6);
        text-decoration: none;
      }

      .dashboard-panel-open:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: 2px;
      }

      .dashboard-panel-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.15rem 0.25rem;
        flex-shrink: 0;
        margin-top: 0.5rem;
        padding: 0;
      }

      .dashboard-panel-tab {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        margin: 0;
        padding: 0.55rem 0.7rem;
        border: 0;
        border-bottom: 2px solid transparent;
        background: transparent;
        color: var(--text-color-secondary);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }

      .dashboard-panel-tab:hover {
        color: var(--text-color);
      }

      .dashboard-panel-tab--active {
        color: var(--text-color);
        border-bottom-color: var(--p-primary-color);
      }

      .dashboard-panel-tab:focus-visible {
        outline: 2px solid var(--p-primary-color);
        outline-offset: -2px;
      }

    `,
  ],
})
export class DashboardPanelComponent implements AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly scrollEl = viewChild<ElementRef<HTMLElement>>('scroll');
  private resizeObserver: ResizeObserver | null = null;
  private mutationObserver: MutationObserver | null = null;
  /** The body has more content below what's showing: fade the bottom edge. */
  readonly moreBelow = signal(false);

  title = input.required<string>();
  /** PrimeIcons name without the "pi " prefix, e.g. "pi-clock". */
  icon = input.required<string>();
  /** Tooltip on the header icon (defaults to the panel title). */
  iconTooltip = input<string>('');
  color = input<DashboardPanelColor>('neutral');
  readonly darkTooltipShowDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;
  /** Header arrow link to the full list. Omit for no arrow. */
  link = input<string | unknown[] | null>(null);
  queryParams = input<Params | null>(null);
  tabs = input<DashboardPanelTab[] | null>(null);
  /** Short muted text after the title (e.g. "November so far"). */
  subtitle = input('');
  /** Let the body grow with its content instead of scrolling at about six rows. */
  fill = input(false);
  /** The header icon is a button that swaps the title for the [panelHeaderAlt] content (and back). */
  iconToggles = input(false);
  /** Whether the alternate header is showing. */
  altShown = model(false);
  /**
   * Weather sky behind the icon tile (clear-day, clear-night, partly-day, partly-night, cloudy, fog, rain, snow, storm).
   * Styles live in _dashboard.scss. With iconToggles, the sky grows across the header with the alternate header.
   */
  sky = input<string | null>(null);
  activeTab = model('');

  ngAfterViewInit() {
    const el = this.scrollEl()?.nativeElement;
    if (!el) return;
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => this.updateFade());
      this.resizeObserver.observe(el);
      // Rows arriving after load change the height without resizing the box.
      this.mutationObserver = new MutationObserver(() => this.updateFade());
      this.mutationObserver.observe(el, { childList: true, subtree: true });
    });
    this.updateFade();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.mutationObserver?.disconnect();
  }

  updateFade() {
    const el = this.scrollEl()?.nativeElement;
    if (!el) return;
    const more = el.scrollHeight - el.scrollTop - el.clientHeight > 2;
    if (more !== this.moreBelow()) this.moreBelow.set(more);
  }

  countClass(tab: DashboardPanelTab): string {
    if (!tab.count) return 'count-badge count-badge--muted';
    return `count-badge count-badge--${tab.countTone ?? 'info'}`;
  }
}
