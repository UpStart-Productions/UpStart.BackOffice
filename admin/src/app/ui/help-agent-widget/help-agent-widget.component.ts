import { Component, computed, DestroyRef, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ChipModule } from 'primeng/chip';
import { MessageModule } from 'primeng/message';
import {
  HELP_AGENT_HISTORY_LIMIT,
  HELP_AGENT_HISTORY_TEXT_MAX,
  HELP_AGENT_NAME,
  type HelpAgentAskRequest,
  type HelpAgentHistoryMessage,
  type HelpAgentPageContext,
} from '@upstart/back-office/shared';
import { describePickedElement, describeSelection, type PickedContext } from './help-agent-pick';
import { HelpAgentActionCardComponent, type HelpAgentAction } from './help-agent-action-card.component';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { SimpleMarkdownPipe } from '../../core/simple-markdown.pipe';
import { DEFAULT_GREETING, pickGreeting } from './personal-greetings';

interface HelpAgentChatMessage {
  role: 'user' | 'assistant';
  text: string;
  /** What the guide looked up for this answer, e.g. ["invoices"]. */
  lookups?: string[];
  /** Changes the guide proposed; each runs only when confirmed on its card. */
  actions?: HelpAgentAction[];
}

const GUIDE_CHAT_STORAGE_PREFIX = 'ubo-guide-chat-';
const GUIDE_CHAT_MAX_MESSAGES = 80;
/** Wait for a highlight to settle before reading it. */
const SELECTION_SETTLE_MS = 250;
/** Show "Still working on it…" after this long (record lookups take a few seconds). */
const SLOW_ANSWER_MS = 4000;
/** A highlight made while the guide was closed is used if the guide opens within this time. */
const PENDING_SELECTION_MS = 60_000;
/** Swallowed outside the widget while picking, so the picking click never triggers the page. */
const PICK_BLOCKED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'dblclick', 'contextmenu'] as const;
/** In-app Back Office guide avatar (floating chat). Name comes from HELP_AGENT_NAME. */
const GUIDE_AVATAR_SRC = '/images/guide-jd-avatar.png';

/**
 * Floating Help Agent chat ("Guide"), mounted once in ShellComponent so
 * it's present on every screen behind the shell (not the pre-auth login
 * page). Open to any signed-in user. Configuring the feature (provider/
 * model/API key in Platform Settings) is still Admin-only. Hidden entirely
 * if the Help Agent hasn't been configured yet, so there's nothing to
 * click into a dead end. The on-screen thread is cached per user in
 * localStorage; the API is still stateless per request.
 */
@Component({
  selector: 'app-help-agent-widget',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    TextareaModule,
    ChipModule,
    MessageModule,
    SimpleMarkdownPipe,
    HelpAgentActionCardComponent,
  ],
  template: `
    @if (visible()) {
      <div class="help-agent-widget">
        @if (open()) {
          <div class="help-agent-panel">
            <div class="help-agent-panel-header">
              <span class="help-agent-panel-title">
                <img class="help-agent-avatar help-agent-panel-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
                <span class="help-agent-panel-title-text">
                  <strong>{{ agentName }}</strong>
                  <span class="help-agent-panel-subtitle">Back Office guide</span>
                </span>
              </span>
              <div class="help-agent-panel-actions">
                <button
                  type="button"
                  class="help-agent-panel-icon-btn"
                  [class.help-agent-panel-icon-btn--active]="picking()"
                  (click)="togglePicking()"
                  [attr.aria-pressed]="picking()"
                  title="Point at something on the screen"
                  aria-label="Point at something on the screen"
                >
                  <i class="pi pi-bullseye"></i>
                </button>
                <button
                  type="button"
                  class="help-agent-panel-icon-btn"
                  (click)="copyChat()"
                  [disabled]="!chatMessages().length"
                  title="Copy conversation"
                  aria-label="Copy conversation"
                >
                  <i class="pi" [class.pi-copy]="!copied()" [class.pi-check]="copied()"></i>
                </button>
                <button
                  type="button"
                  class="help-agent-panel-icon-btn help-agent-panel-icon-btn--danger"
                  (click)="clearChat()"
                  [disabled]="!chatMessages().length"
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  <i class="pi pi-trash"></i>
                </button>
                <button
                  type="button"
                  class="help-agent-panel-icon-btn"
                  (click)="setOpen(false)"
                  title="Close"
                  aria-label="Close guide"
                >
                  <i class="pi pi-times"></i>
                </button>
              </div>
            </div>
            <div class="help-agent-chat-log" #chatLog (click)="onChatLogClick($event)">
              @for (msg of chatMessages(); track $index; let mi = $index) {
                @if (msg.role === 'assistant') {
                  <div class="help-agent-chat-assistant">
                    <img class="help-agent-avatar help-agent-msg-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
                    <div class="help-agent-chat-msg">
                      <div [innerHTML]="msg.text | simpleMarkdown: 'appLinks'"></div>
                      @if (msg.lookups?.length) {
                        <p class="help-agent-lookups text-color-secondary">
                          <i class="pi pi-search" aria-hidden="true"></i> Looked up {{ msg.lookups!.join(', ') }}
                        </p>
                      }
                      @for (action of msg.actions ?? []; track $index; let ai = $index) {
                        <app-help-agent-action-card
                          [action]="action"
                          (confirmed)="runAction(mi, ai, $event)"
                          (cancelled)="patchAction(mi, ai, { status: 'cancelled' })"
                        />
                      }
                    </div>
                  </div>
                } @else {
                  <div class="help-agent-chat-msg help-agent-chat-msg--user">
                    {{ msg.text }}
                  </div>
                }
              } @empty {
                <p class="help-agent-empty-note">
                  Ask {{ agentName }} where to click in Back Office — invoices, time, tasks, CRM, and more.
                </p>
              }
              @if (chatSending()) {
                <div class="help-agent-chat-assistant">
                  <img class="help-agent-avatar help-agent-msg-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
                  <div class="help-agent-chat-msg help-agent-typing" [attr.aria-label]="agentName + ' is typing'">
                    <span class="help-agent-typing-dot"></span>
                    <span class="help-agent-typing-dot"></span>
                    <span class="help-agent-typing-dot"></span>
                    @if (slowAnswer()) {
                      <span class="help-agent-working text-color-secondary">Still working on it…</span>
                    }
                  </div>
                </div>
              }
            </div>
            @if (picking()) {
              <p-message
                class="help-agent-pick-hint"
                severity="info"
                size="small"
                text="Click a panel, button or field on the page. Esc cancels."
              />
            } @else if (pickedContext(); as ctx) {
              <div class="help-agent-context-row">
                <p-chip
                  [label]="ctx.display"
                  [icon]="ctx.withheld ? 'pi pi-eye-slash' : 'pi pi-bullseye'"
                  [removable]="true"
                  (onRemove)="clearPickedContext()"
                />
              </div>
            }
            <div class="help-agent-chat-row">
              <textarea
                #chatInputEl
                pTextarea
                class="help-agent-chat-input"
                [formControl]="chatInput"
                [autoResize]="true"
                rows="1"
                placeholder="e.g. How do I create an invoice from time entries?"
                (keydown)="onPromptKeydown($event)"
              ></textarea>
              <p-button
                icon="pi pi-send"
                [loading]="chatSending()"
                [disabled]="chatSending() || !chatInput.value.trim()"
                (click)="sendChatMessage()"
                aria-label="Send"
              />
            </div>
          </div>
        }
        @if (pickOutline(); as r) {
          <div
            class="help-agent-pick-outline"
            aria-hidden="true"
            [style.top.px]="r.top"
            [style.left.px]="r.left"
            [style.width.px]="r.width"
            [style.height.px]="r.height"
          ></div>
        }
        <div class="help-agent-dock" (mouseenter)="onDockEnter()" (mouseleave)="onDockLeave()">
          <button
            type="button"
            class="help-agent-fab"
            (click)="setOpen(!open())"
            [attr.aria-label]="(open() ? 'Close ' : 'Open ') + agentName + ', Back Office guide'"
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
          @if (!open()) {
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
  `,
  styles: [
    `
      .help-agent-widget {
        position: fixed;
        left: calc(2rem - 10px);
        bottom: calc(1.5rem - 10px);
        z-index: 1100;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
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

      .help-agent-panel-title-text {
        display: flex;
        flex-direction: column;
        gap: 0;
        line-height: 1.15;
        font-size: var(--fs-sm);
      }

      .help-agent-panel-subtitle {
        font-size: var(--fs-xs, 0.75rem);
        font-weight: 400;
        color: var(--color-text-secondary, var(--text-color-secondary));
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
        color: var(--p-primary-contrast-color, #fff);
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
        left: calc(100% + 0.5rem);
        right: auto;
        bottom: 0.5rem;
        width: min(16rem, calc(100vw - 6rem));
        margin: 0;
        padding: 1rem;
        background: #fff;
        color: var(--color-text, var(--text-color, #2d2d2d));
        border: 1px solid var(--color-border, var(--surface-border, #e5e5e5));
        border-radius: 1rem;
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.16);
        transform-origin: left center;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }

      .help-agent-greeting::before {
        content: '';
        position: absolute;
        left: -8px;
        right: auto;
        bottom: 1rem;
        border: 8px solid transparent;
        border-right-color: #fff;
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

      .help-agent-panel {
        display: flex;
        flex-direction: column;
        width: min(26.4rem, calc(100vw - 3rem));
        max-height: 28rem;
        background: #fff;
        border: 1px solid var(--color-border);
        border-radius: var(--content-border-radius);
        box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
        overflow: hidden;
      }

      .help-agent-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.5rem 0.75rem;
        border-bottom: 1px solid var(--color-border);
      }

      .help-agent-panel-title {
        display: flex;
        align-items: center;
        gap: 0.4rem;
      }

      .help-agent-panel-avatar {
        width: 2rem;
        height: 2rem;
      }

      .help-agent-msg-avatar {
        width: 1.75rem;
        height: 1.75rem;
      }

      .help-agent-chat-assistant {
        display: flex;
        align-items: flex-start;
        gap: 0.5rem;
        align-self: flex-start;
        max-width: 90%;
      }

      .help-agent-chat-assistant .help-agent-chat-msg {
        max-width: 100%;
      }

      .help-agent-panel-actions {
        display: flex;
        align-items: center;
        gap: 0.25rem;
      }

      .help-agent-panel-icon-btn {
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--color-text-secondary, #6b6b6b);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0.25rem;
        font-size: var(--fs-sm);
      }

      .help-agent-panel-icon-btn:hover:not(:disabled) {
        color: var(--color-text, #2d2d2d);
      }

      .help-agent-panel-icon-btn--danger {
        color: var(--color-severity-danger-text, #c62828);
      }

      .help-agent-panel-icon-btn--danger:hover:not(:disabled) {
        color: var(--color-severity-danger-text, #c62828);
      }

      .help-agent-panel-icon-btn:disabled {
        opacity: 0.35;
        cursor: default;
      }

      .help-agent-chat-log {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        flex: 1 1 auto;
        min-height: 8rem;
        max-height: 18rem;
        overflow-y: auto;
        padding: 0.75rem 1rem;
      }

      .help-agent-empty-note {
        color: var(--color-text-secondary, #6b6b6b);
        font-size: var(--fs-sm);
        margin: 0;
      }

      .help-agent-chat-msg {
        align-self: flex-start;
        max-width: 85%;
        padding: 0.5rem 0.75rem;
        border-radius: var(--content-border-radius);
        background: var(--surface-100, #f1f1f1);
        font-size: var(--fs-sm);
        white-space: pre-wrap;
      }

      .help-agent-chat-msg--user {
        align-self: flex-end;
        background: var(--p-primary-100, #dbeafe);
      }

      .help-agent-chat-msg ::ng-deep p {
        margin: 0 0 0.5rem;
      }

      .help-agent-chat-msg ::ng-deep ul,
      .help-agent-chat-msg ::ng-deep ol {
        margin: 0 0 0.5rem;
        padding-left: 1.1rem;
      }

      .help-agent-chat-msg ::ng-deep h4 {
        margin: 0.75rem 0 0.35rem;
        font-size: var(--fs-base);
        font-weight: 600;
      }

      .help-agent-chat-msg ::ng-deep h4:first-child {
        margin-top: 0;
      }

      .help-agent-chat-msg ::ng-deep hr {
        border: none;
        border-top: 1px solid var(--surface-border);
        margin: 0.75rem 0;
      }

      .help-agent-chat-msg ::ng-deep li {
        margin-bottom: 0.25rem;
      }

      .help-agent-chat-msg ::ng-deep p:last-child,
      .help-agent-chat-msg ::ng-deep ul:last-child,
      .help-agent-chat-msg ::ng-deep ol:last-child {
        margin-bottom: 0;
      }

      .help-agent-chat-msg ::ng-deep code {
        background: rgba(0, 0, 0, 0.06);
        padding: 0.1rem 0.3rem;
        border-radius: 3px;
        font-size: var(--fs-sm);
      }

      .help-agent-typing {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        padding: 0.65rem 0.85rem;
      }

      .help-agent-typing-dot {
        width: 0.4rem;
        height: 0.4rem;
        border-radius: 50%;
        background: var(--color-text-secondary, #6b6b6b);
        opacity: 0.6;
        animation: help-agent-typing-bounce 1.2s infinite ease-in-out;
      }

      .help-agent-typing-dot:nth-child(2) {
        animation-delay: 0.15s;
      }

      .help-agent-typing-dot:nth-child(3) {
        animation-delay: 0.3s;
      }

      @keyframes help-agent-typing-bounce {
        0%,
        60%,
        100% {
          transform: translateY(0);
          opacity: 0.6;
        }
        30% {
          transform: translateY(-0.25rem);
          opacity: 1;
        }
      }

      .help-agent-chat-row {
        display: flex;
        align-items: flex-end;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--color-border);
      }

      .help-agent-lookups {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        margin: 0.5rem 0 0;
      }

      .help-agent-working {
        margin-left: 0.5rem;
      }

      .help-agent-context-row {
        padding: 0.5rem 1rem 0;
      }

      .help-agent-pick-hint {
        display: block;
        margin: 0.5rem 1rem 0;
      }

      .help-agent-panel-icon-btn--active {
        color: var(--p-primary-color);
      }

      /*
       * Hand-styled: nothing existing draws a hover box over arbitrary page elements. Fixed overlay
       * (pointer-events: none) so page elements are never restyled.
       */
      .help-agent-pick-outline {
        position: fixed;
        z-index: 10000;
        pointer-events: none;
        border: 2px solid var(--p-primary-color);
        border-radius: 6px;
        background: color-mix(in srgb, var(--p-primary-color) 8%, transparent);
        transition: all 60ms ease-out;
      }

      .help-agent-chat-input {
        flex: 1 1 auto;
        min-width: 0;
        resize: none;
        max-height: 10rem;
        overflow-y: auto;
      }
    `,
  ],
})
export class HelpAgentWidgetComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  readonly guideAvatarSrc = GUIDE_AVATAR_SRC;
  readonly agentName = HELP_AGENT_NAME;

  private readonly configured = signal(false);
  readonly visible = computed(() => !!this.session.me() && this.configured());

  readonly open = signal(false);
  readonly boing = signal<'in' | 'out' | null>(null);
  readonly greeting = signal(DEFAULT_GREETING);
  private pointerOnDock = false;
  private ignoreHoverUntilLeave = false;
  readonly chatMessages = signal<HelpAgentChatMessage[]>([]);
  readonly chatInput = new FormControl('', { nonNullable: true });
  readonly chatSending = signal(false);
  /** Record lookups can take several seconds; say so after a short wait. */
  readonly slowAnswer = signal(false);
  readonly copied = signal(false);

  /** "Point at it" mode: the next click on the page picks context instead of doing anything. */
  readonly picking = signal(false);
  readonly pickOutline = signal<{ top: number; left: number; width: number; height: number } | null>(null);
  readonly pickedContext = signal<PickedContext | null>(null);
  private labelSet: ReadonlySet<string> | null = null;

  /** Text highlighted while the guide was closed; used if the guide opens soon after. */
  private pendingSelection: { context: PickedContext; at: number } | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerDownInWidget = false;

  private readonly chatLogEl = viewChild<ElementRef<HTMLDivElement>>('chatLog');
  private readonly chatInputEl = viewChild<ElementRef<HTMLTextAreaElement>>('chatInputEl');

  async ngOnInit() {
    // ShellComponent already awaits session.getReady() before rendering,
    // but await defensively here too in case this component ever mounts
    // somewhere that doesn't guarantee that ordering.
    await this.session.getReady();
    const me = this.session.me();
    if (!me) return;

    // Picked context belongs to one screen.
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.clearPickedContext());
    document.addEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('pointerdown', this.onAnyPointerDown, true);
    this.destroyRef.onDestroy(() => {
      this.stopPicking();
      document.removeEventListener('selectionchange', this.onSelectionChange);
      document.removeEventListener('pointerdown', this.onAnyPointerDown, true);
      if (this.selectionTimer) clearTimeout(this.selectionTimer);
    });

    this.greeting.set(pickGreeting(me.email));
    this.restoreChat();
    try {
      // /status, not /settings: /settings is Admin-only (provider/model/key
      // detail), /status is the any-signed-in-user "is this even on" check.
      const status = await this.api.get<{ configured: boolean }>('/help-agent/status');
      this.configured.set(status.configured);
    } catch {
      // Not configured, or the check failed, either way just don't show the widget.
    }
  }

  async sendChatMessage() {
    const message = this.chatInput.value.trim();
    if (!message || this.chatSending()) return;

    const history = this.historyForRequest();
    this.chatMessages.update((msgs) => [...msgs, { role: 'user', text: message }]);
    this.persistChat();
    this.chatInput.setValue('');
    this.resetPromptHeight();
    this.chatSending.set(true);
    this.slowAnswer.set(false);
    const slowTimer = setTimeout(() => this.slowAnswer.set(true), SLOW_ANSWER_MS);
    this.scrollLastMessageIntoView();
    try {
      const page = await this.currentPageContext();
      const target = this.pickedContext()?.target;
      const body: HelpAgentAskRequest = {
        message,
        history,
        ...(page ? { page } : {}),
        ...(target ? { target } : {}),
      };
      const res = await this.api.post<{
        answer: string;
        lookups?: string[];
        actions?: Array<Omit<HelpAgentAction, 'status' | 'error'>>;
      }>('/help-agent/ask', body);
      const actions = (res.actions ?? []).map((a) => ({ ...a, status: 'pending' as const }));
      this.chatMessages.update((msgs) => [
        ...msgs,
        {
          role: 'assistant',
          text: res.answer,
          ...(res.lookups?.length ? { lookups: res.lookups } : {}),
          ...(actions.length ? { actions } : {}),
        },
      ]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to reach the Help Agent';
      this.chatMessages.update((msgs) => [...msgs, { role: 'assistant', text: `Error: ${detail}` }]);
    } finally {
      clearTimeout(slowTimer);
      this.slowAnswer.set(false);
      this.persistChat();
      this.chatSending.set(false);
      this.scrollLastMessageIntoView();
    }
  }

  patchAction(messageIndex: number, actionIndex: number, patch: Partial<HelpAgentAction>) {
    this.chatMessages.update((msgs) =>
      msgs.map((m, i) =>
        i === messageIndex && m.actions
          ? { ...m, actions: m.actions.map((a, j) => (j === actionIndex ? { ...a, ...patch } : a)) }
          : m,
      ),
    );
    this.persistChat();
  }

  /** Runs a change the person confirmed on its card, then posts the result (with record links) as a reply. */
  async runAction(messageIndex: number, actionIndex: number, args: Record<string, unknown>) {
    const action = this.chatMessages()[messageIndex]?.actions?.[actionIndex];
    if (!action || action.status === 'running' || action.status === 'done') return;
    this.patchAction(messageIndex, actionIndex, { args, status: 'running', error: undefined });
    try {
      const res = await this.api.post<{ result: string; isError: boolean }>('/help-agent/actions/run', {
        tool: action.tool,
        args,
      });
      if (res.isError) {
        this.patchAction(messageIndex, actionIndex, { status: 'failed', error: res.result });
        return;
      }
      this.patchAction(messageIndex, actionIndex, { status: 'done' });
      this.chatMessages.update((msgs) => [...msgs, { role: 'assistant', text: `Done. ${res.result}` }]);
      this.persistChat();
      this.scrollLastMessageIntoView();
    } catch (err) {
      this.patchAction(messageIndex, actionIndex, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'That change did not go through.',
      });
    }
  }

  /**
   * The last few messages before the one being sent, so follow-ups ("and then?") make sense.
   * Error bubbles are local only and never sent.
   */
  private historyForRequest(): HelpAgentHistoryMessage[] {
    return this.chatMessages()
      .filter((m) => !(m.role === 'assistant' && m.text.startsWith('Error: ')))
      .slice(-HELP_AGENT_HISTORY_LIMIT)
      .map((m) => ({ role: m.role, text: m.text.slice(0, HELP_AGENT_HISTORY_TEXT_MAX) }));
  }

  /**
   * Which screen the person is on: the help drawer's route pattern (e.g. "organizations/:id") and
   * article title. Labels only, never record data, so IDs in the URL are not sent. The help content
   * is imported lazily to keep it out of the main bundle (the widget is on every page).
   */
  private async currentPageContext(): Promise<HelpAgentPageContext | null> {
    try {
      const { matchHelpRoute } = await import('../help-drawer/help-content');
      const hit = matchHelpRoute(this.router.url);
      return hit ? { route: hit.pattern, title: hit.article.title } : null;
    } catch {
      return null;
    }
  }

  /** The label list is large, so it loads only when someone first points or highlights. */
  private async loadLabels(): Promise<ReadonlySet<string>> {
    if (this.labelSet) return this.labelSet;
    try {
      const { HELP_AGENT_UI_LABELS } = await import('@upstart/back-office/shared/help-labels');
      this.labelSet = new Set(HELP_AGENT_UI_LABELS);
      return this.labelSet;
    } catch (err) {
      // Not cached, so the next point/highlight retries. Without labels everything reads as "not shared".
      console.warn('[help-agent] Could not load the screen label list; context will be panel-free.', err);
      return new Set();
    }
  }

  private readonly onAnyPointerDown = (event: Event) => {
    this.lastPointerDownInWidget = event.target instanceof Node && this.host.nativeElement.contains(event.target);
  };

  /**
   * Highlighting text on the page sets the context chip (live while the guide is open, or on the
   * next open within a minute). Selections inside the guide itself are ignored.
   */
  private readonly onSelectionChange = () => {
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => void this.captureSelection(), SELECTION_SETTLE_MS);
  };

  private async captureSelection() {
    if (!this.visible() || this.picking()) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Clicking elsewhere on the page drops a pending highlight; clicking into the guide keeps it.
      if (!this.lastPointerDownInWidget) this.pendingSelection = null;
      return;
    }
    const anchor = selection.anchorNode;
    if (anchor && this.host.nativeElement.contains(anchor)) return;

    const context = describeSelection(selection, await this.loadLabels());
    if (!context) return;
    if (this.open()) this.pickedContext.set(context);
    else this.pendingSelection = { context, at: Date.now() };
  }

  async togglePicking() {
    if (this.picking()) {
      this.stopPicking();
      return;
    }
    await this.loadLabels();
    this.picking.set(true);
    document.addEventListener('pointermove', this.onPickMove, true);
    for (const type of PICK_BLOCKED_EVENTS) document.addEventListener(type, this.onPickBlock, true);
    document.addEventListener('click', this.onPickClick, true);
    document.addEventListener('keydown', this.onPickKey, true);
    window.addEventListener('scroll', this.onPickScroll, true);
  }

  private stopPicking() {
    this.picking.set(false);
    this.pickOutline.set(null);
    document.removeEventListener('pointermove', this.onPickMove, true);
    for (const type of PICK_BLOCKED_EVENTS) document.removeEventListener(type, this.onPickBlock, true);
    document.removeEventListener('click', this.onPickClick, true);
    document.removeEventListener('keydown', this.onPickKey, true);
    window.removeEventListener('scroll', this.onPickScroll, true);
  }

  clearPickedContext() {
    this.pickedContext.set(null);
  }

  /** Page element under the pointer, or null when it is part of this widget. */
  private pickableTarget(event: Event): HTMLElement | null {
    const el = event.target instanceof HTMLElement ? event.target : null;
    if (!el || this.host.nativeElement.contains(el)) return null;
    return el;
  }

  private readonly onPickMove = (event: PointerEvent) => {
    const el = this.pickableTarget(event);
    if (!el) {
      this.pickOutline.set(null);
      return;
    }
    const r = describePickedElement(el, this.labelSet ?? new Set()).highlight.getBoundingClientRect();
    this.pickOutline.set({ top: r.top - 2, left: r.left - 2, width: r.width + 4, height: r.height + 4 });
  };

  /** Stops the page from reacting (buttons, menus, focus) to the click that picks. */
  private readonly onPickBlock = (event: Event) => {
    if (!this.pickableTarget(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  private readonly onPickClick = (event: MouseEvent) => {
    const el = this.pickableTarget(event);
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.pickedContext.set(describePickedElement(el, this.labelSet ?? new Set()).context);
    this.stopPicking();
    this.chatInputEl()?.nativeElement.focus();
  };

  private readonly onPickKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.stopPicking();
  };

  private readonly onPickScroll = () => this.pickOutline.set(null);

  /** Record links in answers open inside the app (chat stays open). Cmd/Ctrl/middle-click open a new tab. */
  onChatLogClick(event: MouseEvent) {
    const link = (event.target as HTMLElement | null)?.closest?.('a[data-app-link]') as HTMLAnchorElement | null;
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (href) void this.router.navigateByUrl(href);
  }

  onPromptKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    void this.sendChatMessage();
  }

  private resetPromptHeight() {
    const el = this.chatInputEl()?.nativeElement;
    if (!el) return;
    el.style.height = 'auto';
    el.dispatchEvent(new Event('input'));
  }

  setOpen(next: boolean) {
    if (next && this.pendingSelection && Date.now() - this.pendingSelection.at < PENDING_SELECTION_MS) {
      this.pickedContext.set(this.pendingSelection.context);
    }
    this.pendingSelection = null;
    this.open.set(next);
    this.boing.set(null);
    this.ignoreHoverUntilLeave = !next && this.pointerOnDock;
    this.persistChat();
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
    if (this.open()) {
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

  clearChat() {
    this.chatMessages.set([]);
    this.persistChat();
  }

  private storageKey(): string | null {
    const id = this.session.me()?.id;
    return id ? `${GUIDE_CHAT_STORAGE_PREFIX}${id}` : null;
  }

  private restoreChat() {
    const key = this.storageKey();
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const data = JSON.parse(raw) as { messages?: unknown };
      const messages = Array.isArray(data.messages)
        ? data.messages.filter(
            (m): m is HelpAgentChatMessage =>
              !!m &&
              typeof m === 'object' &&
              (m.role === 'user' || m.role === 'assistant') &&
              typeof m.text === 'string',
          )
        : [];
      // A change that was running when the page closed may or may not have gone through.
      this.chatMessages.set(
        messages.map((m) =>
          m.actions?.some((a) => a.status === 'running')
            ? {
                ...m,
                actions: m.actions.map((a) =>
                  a.status === 'running'
                    ? { ...a, status: 'failed' as const, error: 'Not sure this finished. Check the record before trying again.' }
                    : a,
                ),
              }
            : m,
        ),
      );
    } catch {
      // Bad or leftover storage — start fresh.
    }
  }

  private persistChat() {
    const key = this.storageKey();
    if (!key) return;
    const messages = this.chatMessages().slice(-GUIDE_CHAT_MAX_MESSAGES);
    try {
      if (!messages.length && !this.open()) {
        localStorage.removeItem(key);
        return;
      }
      localStorage.setItem(key, JSON.stringify({ messages }));
    } catch {
      // Quota or private mode — chat still works for this page view.
    }
  }

  async copyChat() {
    const text = this.chatMessages()
      .map((msg) => `${msg.role === 'user' ? 'You' : 'Guide'}: ${msg.text}`)
      .join('\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, insecure context); nothing
      // actionable to show beyond the icon just not flipping to a checkmark.
    }
  }

  /**
   * Runs after chatMessages() changes. Signal writes and the resulting DOM
   * update aren't synchronous, so this defers to the next tick before
   * measuring layout, otherwise it measures the size *before* the new
   * message rendered.
   *
   * Deliberately scrolls to the top of the newest message, not to the
   * bottom of the log. A plain scrollTop = scrollHeight jump means a
   * response taller than the panel has its opening lines scrolled up and
   * out of view, so you land mid-answer instead of at the start of it.
   * Aligning the new message's top edge to the container's top, smoothly,
   * fixes both: no jarring snap, and the beginning of the response is
   * always what's visible first.
   */
  private scrollLastMessageIntoView() {
    setTimeout(() => {
      const container = this.chatLogEl()?.nativeElement;
      const last = container?.lastElementChild as HTMLElement | null;
      if (!container || !last) return;

      const targetTop =
        last.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      container.scrollTo({ top: targetTop, behavior: 'smooth' });
    });
  }
}
