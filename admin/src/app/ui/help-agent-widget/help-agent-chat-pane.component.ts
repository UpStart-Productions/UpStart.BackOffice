import { Component, computed, DestroyRef, effect, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { ChipModule } from 'primeng/chip';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
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
import { HelpAgentPickOverlayService } from '../../core/help-agent-pick-overlay.service';
import { HelpSidePanelService } from '../../core/help-side-panel.service';
import { UBO_DARK_TOOLTIP_SHOW_DELAY_MS } from '../../core/ubo-dark-tooltip';

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

/** Guide chat body inside the right-hand help panel (Ask tab). */
@Component({
  selector: 'app-help-agent-chat-pane',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    TextareaModule,
    ChipModule,
    MessageModule,
    TagModule,
    TooltipModule,
    SimpleMarkdownPipe,
    HelpAgentActionCardComponent,
  ],
  template: `
    <div class="help-agent-chat-pane">
      <div class="help-agent-chat-log" #chatLog (click)="onChatLogClick($event)">
        <div class="help-agent-chat-log-inner">
          @for (msg of chatMessages(); track $index; let mi = $index) {
            @if (msg.role === 'assistant') {
              <div class="help-agent-chat-assistant">
                <img class="help-agent-avatar help-agent-msg-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
                <div class="help-agent-chat-msg help-agent-chat-msg--assistant">
                  <div [innerHTML]="msg.text | simpleMarkdown: 'appLinks'"></div>
                  @if (msg.lookups?.length) {
                    <p-tag
                      class="help-agent-lookups-tag"
                      severity="secondary"
                      [value]="'Looked up ' + msg.lookups!.join(', ')"
                      icon="pi pi-search"
                    />
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
      </div>
      <div class="help-agent-chat-footer">
        <div class="help-agent-panel-toolbar">
          <span class="help-agent-toolbar-identity">
            <img class="help-agent-avatar help-agent-toolbar-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
            <span class="help-agent-toolbar-name">{{ agentName }}</span>
          </span>
          <div class="help-agent-toolbar-actions">
            <button
              type="button"
              class="help-agent-panel-icon-btn"
              [class.help-agent-panel-icon-btn--active]="picking()"
              (click)="togglePicking()"
              [attr.aria-pressed]="picking()"
              pTooltip="Point at something on the screen"
              tooltipPosition="top"
              [showDelay]="darkTooltipShowDelayMs"
              tooltipStyleClass="ubo-dark-tooltip"
              appendTo="body"
              aria-label="Point at something on the screen"
            >
              <i class="pi pi-bullseye"></i>
            </button>
            <button
              type="button"
              class="help-agent-panel-icon-btn"
              (click)="copyChat()"
              [disabled]="!chatMessages().length"
              [pTooltip]="copied() ? 'Copied' : 'Copy conversation'"
              tooltipPosition="top"
              [showDelay]="darkTooltipShowDelayMs"
              tooltipStyleClass="ubo-dark-tooltip"
              appendTo="body"
              aria-label="Copy conversation"
            >
              <i class="pi" [class.pi-copy]="!copied()" [class.pi-check]="copied()"></i>
            </button>
            <button
              type="button"
              class="help-agent-panel-icon-btn help-agent-panel-icon-btn--danger"
              (click)="clearChat()"
              [disabled]="!chatMessages().length"
              pTooltip="Clear conversation"
              tooltipPosition="top"
              [showDelay]="darkTooltipShowDelayMs"
              tooltipStyleClass="ubo-dark-tooltip"
              appendTo="body"
              aria-label="Clear conversation"
            >
              <i class="pi pi-trash"></i>
            </button>
          </div>
        </div>
        @if (picking()) {
          <p-message
            class="help-agent-pick-hint"
            severity="info"
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
            rows="3"
            placeholder="How do I create an invoice from time entries?"
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
    </div>
  `,
})
export class HelpAgentChatPaneComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sidePanel = inject(HelpSidePanelService);
  private readonly pickOverlay = inject(HelpAgentPickOverlayService);

  readonly guideAvatarSrc = GUIDE_AVATAR_SRC;
  readonly agentName = HELP_AGENT_NAME;
  protected readonly darkTooltipShowDelayMs = UBO_DARK_TOOLTIP_SHOW_DELAY_MS;

  readonly guideActive = computed(
    () => this.sidePanel.open() && this.sidePanel.mode() === 'guide' && !!this.session.me(),
  );

  readonly chatMessages = signal<HelpAgentChatMessage[]>([]);
  readonly chatInput = new FormControl('', { nonNullable: true });
  readonly chatSending = signal(false);
  /** Record lookups can take several seconds; say so after a short wait. */
  readonly slowAnswer = signal(false);
  readonly copied = signal(false);

  /** "Point at it" mode: the next click on the page picks context instead of doing anything. */
  readonly picking = signal(false);
  readonly pickedContext = signal<PickedContext | null>(null);
  private labelSet: ReadonlySet<string> | null = null;

  /** Text highlighted while the guide was closed; used if the guide opens soon after. */
  private pendingSelection: { context: PickedContext; at: number } | null = null;
  private selectionTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPointerDownInWidget = false;
  /** Avoid writing empty chat to storage before restoreChat finishes. */
  private chatStorageReady = false;

  private readonly chatLogEl = viewChild<ElementRef<HTMLDivElement>>('chatLog');
  private readonly chatInputEl = viewChild<ElementRef<HTMLTextAreaElement>>('chatInputEl');

  constructor() {
    effect(() => {
      if (!this.guideActive()) {
        if (this.picking()) this.stopPicking();
        return;
      }
      if (this.pendingSelection && Date.now() - this.pendingSelection.at < PENDING_SELECTION_MS) {
        this.pickedContext.set(this.pendingSelection.context);
      }
      this.pendingSelection = null;
      if (this.chatStorageReady) this.persistChat();
      queueMicrotask(() => this.scrollLastMessageIntoView());
    });
  }

  async ngOnInit() {
    await this.session.getReady();
    if (!this.session.me()) return;

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

    this.restoreChat();
    this.chatStorageReady = true;
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
    const target = event.target;
    this.lastPointerDownInWidget = target instanceof Node && this.isHelpAgentUi(target);
  };

  private isHelpAgentUi(node: Node | null): boolean {
    if (!node) return false;
    if (this.host.nativeElement.contains(node)) return true;
    for (const root of Array.from(document.querySelectorAll('[data-help-agent-ui]'))) {
      if (root.contains(node)) return true;
    }
    return false;
  }

  /**
   * Highlighting text on the page sets the context chip (live while the guide is open, or on the
   * next open within a minute). Selections inside the guide itself are ignored.
   */
  private readonly onSelectionChange = () => {
    if (this.selectionTimer) clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => void this.captureSelection(), SELECTION_SETTLE_MS);
  };

  private async captureSelection() {
    if (!this.sidePanel.guideConfigured() || this.picking()) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      // Clicking elsewhere on the page drops a pending highlight; clicking into the guide keeps it.
      if (!this.lastPointerDownInWidget) this.pendingSelection = null;
      return;
    }
    const anchor = selection.anchorNode;
    if (this.isHelpAgentUi(anchor)) return;

    const context = describeSelection(selection, await this.loadLabels());
    if (!context) return;
    if (this.guideActive()) this.pickedContext.set(context);
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
    this.pickOverlay.rect.set(null);
    document.removeEventListener('pointermove', this.onPickMove, true);
    for (const type of PICK_BLOCKED_EVENTS) document.removeEventListener(type, this.onPickBlock, true);
    document.removeEventListener('click', this.onPickClick, true);
    document.removeEventListener('keydown', this.onPickKey, true);
    window.removeEventListener('scroll', this.onPickScroll, true);
  }

  clearPickedContext() {
    this.pickedContext.set(null);
  }

  /** Page element under the pointer, or null when it is part of the guide UI. */
  private pickableTarget(event: Event): HTMLElement | null {
    const el = event.target instanceof HTMLElement ? event.target : null;
    if (!el || this.isHelpAgentUi(el)) return null;
    return el;
  }

  private readonly onPickMove = (event: PointerEvent) => {
    const el = this.pickableTarget(event);
    if (!el) {
      this.pickOverlay.rect.set(null);
      return;
    }
    const r = describePickedElement(el, this.labelSet ?? new Set()).highlight.getBoundingClientRect();
    this.pickOverlay.rect.set({ top: r.top - 2, left: r.left - 2, width: r.width + 4, height: r.height + 4 });
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

  private readonly onPickScroll = () => this.pickOverlay.rect.set(null);

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

  clearChat() {
    this.chatMessages.set([]);
    const key = this.storageKey();
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
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
    if (!this.chatStorageReady) return;
    const key = this.storageKey();
    if (!key) return;
    const messages = this.chatMessages().slice(-GUIDE_CHAT_MAX_MESSAGES);
    if (!messages.length) return;
    try {
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

  /** Keeps the latest messages pinned to the bottom of the scroll area. */
  private scrollLastMessageIntoView() {
    setTimeout(() => {
      const container = this.chatLogEl()?.nativeElement;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    });
  }
}
