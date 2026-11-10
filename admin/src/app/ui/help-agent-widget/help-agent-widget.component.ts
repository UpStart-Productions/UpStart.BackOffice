import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { HelpAgentPickOverlayService } from '../../core/help-agent-pick-overlay.service';
import { HelpSidePanelService } from '../../core/help-side-panel.service';
import { SessionService } from '../../core/session.service';
import { DEFAULT_GREETING, pickGreeting } from './personal-greetings';

const GUIDE_AVATAR_SRC = '/images/guide-jd-avatar.png';

/**
 * Floating guide avatar (bottom right). Opens the shared right-hand panel in Ask mode.
 */
@Component({
  selector: 'app-help-agent-widget',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="help-agent-widget" data-help-agent-ui>
        <div class="help-agent-dock" (mouseenter)="onDockEnter()" (mouseleave)="onDockLeave()">
          <button
            type="button"
            class="help-agent-fab"
            (click)="onFabClick()"
            [attr.aria-label]="fabAriaLabel()"
            [attr.aria-expanded]="sidePanel.open() && sidePanel.mode() === 'guide'"
          >
            <img
              class="help-agent-avatar help-agent-fab-avatar"
              [src]="guideAvatarSrc"
              alt=""
              aria-hidden="true"
              [class.help-agent-fab-avatar--boing-in]="boing() === 'in'"
              [class.help-agent-fab-avatar--boing-out]="boing() === 'out'"
            />
          </button>
          @if (!(sidePanel.open() && sidePanel.mode() === 'guide')) {
            <p
              class="help-agent-greeting"
              [class.help-agent-greeting--in]="boing() === 'in'"
              [class.help-agent-greeting--out]="boing() === 'out'"
              aria-hidden="true"
            >
              {{ greeting() }}
            </p>
          }
        </div>
      </div>
    }
    @if (pickOverlay.rect(); as r) {
      <div
        class="help-agent-pick-outline"
        aria-hidden="true"
        [style.top.px]="r.top"
        [style.left.px]="r.left"
        [style.width.px]="r.width"
        [style.height.px]="r.height"
      ></div>
    }
  `,
  styles: [
    `
      .help-agent-pick-outline {
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        border: 2px solid var(--p-primary-color);
        border-radius: 6px;
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
        transition: all 60ms ease-out;
      }

      .help-agent-widget {
        position: fixed;
        right: calc(2rem - 10px);
        bottom: calc(1.5rem - 10px);
        z-index: 1100;
      }

      :host-context(.has-impersonation-banner) .help-agent-widget {
        bottom: calc(1.5rem + 2rem - 10px);
      }

      .help-agent-avatar {
        border: none;
        outline: none;
        box-shadow: none;
        border-radius: 50%;
        object-fit: cover;
        display: block;
        flex-shrink: 0;
        background: transparent;
      }

      .help-agent-dock {
        position: relative;
      }

      .help-agent-fab {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        outline: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        padding: 0;
        background: transparent;
        box-shadow: none;
      }

      .help-agent-fab:focus-visible {
        outline: 2px solid var(--p-primary-500, #7c3aed);
        outline-offset: 2px;
      }

      .help-agent-fab-avatar {
        width: 100%;
        height: 100%;
        transform-origin: center center;
      }

      .help-agent-fab-avatar--boing-in {
        animation: help-agent-boing-in 0.5s ease-out both;
      }

      .help-agent-fab-avatar--boing-out {
        animation: help-agent-boing-out 0.45s ease-out both;
      }

      @keyframes help-agent-boing-in {
        0% {
          transform: scale(1);
        }
        40% {
          transform: scale(1.16);
        }
        62% {
          transform: scale(1.04);
        }
        80% {
          transform: scale(1.1);
        }
        100% {
          transform: scale(1.08);
        }
      }

      @keyframes help-agent-boing-out {
        0% {
          transform: scale(1.08);
        }
        40% {
          transform: scale(0.94);
        }
        65% {
          transform: scale(1.04);
        }
        100% {
          transform: scale(1);
        }
      }

      .help-agent-greeting {
        position: absolute;
        right: calc(100% + 0.5rem);
        left: auto;
        bottom: 0.5rem;
        width: min(16rem, calc(100vw - 6rem));
        margin: 0;
        padding: 1rem;
        background: #fff;
        color: var(--color-text, var(--text-color, #2d2d2d));
        border: 1px solid var(--color-border, var(--surface-border, #e5e5e5));
        border-radius: 1rem;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
        transform-origin: right center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .help-agent-greeting::before {
        content: '';
        position: absolute;
        right: -8px;
        left: auto;
        bottom: 1rem;
        border: 8px solid transparent;
        border-left-color: #fff;
      }

      .help-agent-greeting--in {
        visibility: visible;
        animation: help-agent-greeting-in 0.45s ease-out both;
      }

      .help-agent-greeting--out {
        visibility: visible;
        animation: help-agent-greeting-out 0.35s ease-out both;
      }

      @keyframes help-agent-greeting-in {
        0% {
          opacity: 0;
          transform: scale(0.72);
        }
        40% {
          opacity: 1;
          transform: scale(1.08);
        }
        68% {
          transform: scale(0.96);
        }
        100% {
          opacity: 1;
          transform: scale(1);
        }
      }

      @keyframes help-agent-greeting-out {
        0% {
          opacity: 1;
          transform: scale(1);
        }
        100% {
          opacity: 0;
          transform: scale(0.85);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .help-agent-fab-avatar--boing-in,
        .help-agent-fab-avatar--boing-out,
        .help-agent-greeting--in,
        .help-agent-greeting--out {
          animation: none;
        }

        .help-agent-greeting--in {
          opacity: 1;
          transform: none;
        }

        .help-agent-greeting--out {
          opacity: 0;
        }
      }
    `,
  ],
})
export class HelpAgentWidgetComponent implements OnInit {
  protected readonly sidePanel = inject(HelpSidePanelService);
  protected readonly pickOverlay = inject(HelpAgentPickOverlayService);
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);

  readonly guideAvatarSrc = GUIDE_AVATAR_SRC;

  private readonly configured = signal(false);
  readonly visible = computed(() => !!this.session.me() && this.configured());

  readonly boing = signal<'in' | 'out' | null>(null);
  readonly greeting = signal(DEFAULT_GREETING);
  private pointerOnDock = false;
  private ignoreHoverUntilLeave = false;

  fabAriaLabel(): string {
    const open = this.sidePanel.open() && this.sidePanel.mode() === 'guide';
    return (open ? 'Close ' : 'Open ') + 'Back Office guide';
  }

  async ngOnInit() {
    await this.session.getReady();
    const me = this.session.me();
    if (!me) return;
    this.greeting.set(pickGreeting(me.email));
    try {
      const status = await this.api.get<{ configured: boolean }>('/help-agent/status');
      this.configured.set(status.configured);
      this.sidePanel.guideConfigured.set(status.configured);
      if (!status.configured && this.sidePanel.mode() === 'guide') {
        this.sidePanel.setMode('article');
      }
    } catch {
      this.configured.set(false);
      this.sidePanel.guideConfigured.set(false);
      if (this.sidePanel.mode() === 'guide') this.sidePanel.setMode('article');
    }
  }

  onFabClick(): void {
    this.boing.set(null);
    this.ignoreHoverUntilLeave = this.pointerOnDock && !(this.sidePanel.open() && this.sidePanel.mode() === 'guide');
    this.sidePanel.toggleGuide();
  }

  onDockEnter() {
    this.pointerOnDock = true;
    this.greeting.update((g) => pickGreeting(this.session.me()?.email, g));
    this.playBoing('in');
  }

  onDockLeave() {
    this.pointerOnDock = false;
    this.ignoreHoverUntilLeave = false;
    this.playBoing('out');
  }

  playBoing(dir: 'in' | 'out') {
    if (this.sidePanel.open() && this.sidePanel.mode() === 'guide') {
      this.boing.set(null);
      return;
    }
    if (dir === 'in' && this.ignoreHoverUntilLeave) return;
    if (dir === 'out' && this.boing() !== 'in') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.boing.set(dir === 'in' ? 'in' : null);
      return;
    }
    this.boing.set(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.boing.set(dir));
    });
  }
}
