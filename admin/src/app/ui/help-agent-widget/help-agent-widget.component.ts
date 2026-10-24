import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { SessionService } from '../../core/session.service';
import { SimpleMarkdownPipe } from '../../core/simple-markdown.pipe';

interface HelpAgentChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

const GUIDE_CHAT_STORAGE_PREFIX = 'ubo-guide-chat-';
const GUIDE_CHAT_MAX_MESSAGES = 80;

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
  imports: [ReactiveFormsModule, ButtonModule, TextareaModule, SimpleMarkdownPipe],
  template: `
    @if (visible()) {
      <div class="help-agent-widget">
        @if (open()) {
          <div class="help-agent-panel">
            <div class="help-agent-panel-header">
              <span class="help-agent-panel-title">
                <span class="help-agent-panel-avatar help-agent-panel-avatar--icon" aria-hidden="true"><i class="pi pi-sparkles"></i></span>
                <strong>Back Office Guide</strong>
              </span>
              <div class="help-agent-panel-actions">
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
                  class="help-agent-panel-icon-btn"
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
            <div class="help-agent-chat-log" #chatLog>
              @for (msg of chatMessages(); track $index) {
                @if (msg.role === 'assistant') {
                  <div class="help-agent-chat-assistant">
                    <span class="help-agent-msg-avatar help-agent-msg-avatar--icon" aria-hidden="true"><i class="pi pi-sparkles"></i></span>
                    <div class="help-agent-chat-msg">
                      <div [innerHTML]="msg.text | simpleMarkdown"></div>
                    </div>
                  </div>
                } @else {
                  <div class="help-agent-chat-msg help-agent-chat-msg--user">
                    {{ msg.text }}
                  </div>
                }
              } @empty {
                <p class="help-agent-empty-note">
                  Ask where to click in Back Office — invoices, time, tasks, CRM, and more.
                </p>
              }
              @if (chatSending()) {
                <div class="help-agent-chat-assistant">
                  <span class="help-agent-msg-avatar help-agent-msg-avatar--icon" aria-hidden="true"><i class="pi pi-sparkles"></i></span>
                  <div class="help-agent-chat-msg help-agent-typing" aria-label="Guide is typing">
                    <span class="help-agent-typing-dot"></span>
                    <span class="help-agent-typing-dot"></span>
                    <span class="help-agent-typing-dot"></span>
                  </div>
                </div>
              }
            </div>
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
        <div class="help-agent-dock" (mouseenter)="onDockEnter()" (mouseleave)="onDockLeave()">
          <button
            type="button"
            class="help-agent-fab"
            (click)="setOpen(!open())"
            [attr.aria-label]="open() ? 'Close guide' : 'Open guide'"
          >
            <span
              class="help-agent-fab-avatar help-agent-fab-avatar--icon"
              [class.help-agent-fab-avatar--boing-in]="boing() === 'in'"
              [class.help-agent-fab-avatar--boing-out]="boing() === 'out'"
              aria-hidden="true"
            ><i class="pi pi-sparkles"></i></span>
          </button>
          @if (!open()) {
            <p
              class="help-agent-greeting"
              [class.help-agent-greeting--in]="boing() === 'in'"
              [class.help-agent-greeting--out]="boing() === 'out'"
              aria-hidden="true"
            >
              Hi! I'm your Back Office guide. Ask me anything.
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
        right: 1.25rem;
        bottom: 1.5rem;
        z-index: 1100;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
      }

      :host-context(.has-impersonation-banner) .help-agent-widget {
        bottom: calc(1.5rem + 2rem);
      }

      .help-agent-fab-avatar--icon,
      .help-agent-panel-avatar--icon,
      .help-agent-msg-avatar--icon {
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--p-primary-500, #7c3aed);
        color: #fff;
        border-radius: 50%;
      }

      .help-agent-fab-avatar--icon {
        width: 100%;
        height: 100%;
        font-size: 1.5rem;
      }

      .help-agent-panel-avatar--icon {
        font-size: 1.1rem;
      }

      .help-agent-msg-avatar--icon {
        font-size: 0.85rem;
      }

      .help-agent-dock {
        position: relative;
      }

      .help-agent-fab {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: visible;
        padding: 0;
        color: var(--p-primary-contrast-color, #fff);
        background: transparent;
        box-shadow: none;
      }

      .help-agent-fab-avatar {
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
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
        padding: 0.75rem 1rem;
        border-bottom: 1px solid var(--color-border);
      }

      .help-agent-panel-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .help-agent-panel-avatar {
        width: 2.625rem;
        height: 2.625rem;
        border-radius: 50%;
        object-fit: contain;
        flex-shrink: 0;
      }

      .help-agent-msg-avatar {
        width: 1.75rem;
        height: 1.75rem;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
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
        font-size: 0.875rem;
      }

      .help-agent-panel-icon-btn:hover:not(:disabled) {
        color: var(--color-text, #2d2d2d);
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
        font-size: 0.875rem;
        margin: 0;
      }

      .help-agent-chat-msg {
        align-self: flex-start;
        max-width: 85%;
        padding: 0.5rem 0.75rem;
        border-radius: var(--content-border-radius);
        background: var(--surface-100, #f1f1f1);
        font-size: 0.875rem;
        white-space: pre-wrap;
      }

      .help-agent-chat-msg--user {
        align-self: flex-end;
        background: var(--p-primary-100, #dbeafe);
      }

      .help-agent-chat-msg p {
        margin: 0 0 0.5rem;
      }

      .help-agent-chat-msg ul,
      .help-agent-chat-msg ol {
        margin: 0 0 0.5rem;
        padding-left: 1.1rem;
      }

      .help-agent-chat-msg li {
        margin-bottom: 0.25rem;
      }

      .help-agent-chat-msg p:last-child,
      .help-agent-chat-msg ul:last-child,
      .help-agent-chat-msg ol:last-child {
        margin-bottom: 0;
      }

      .help-agent-chat-msg code {
        background: rgba(0, 0, 0, 0.06);
        padding: 0.1rem 0.3rem;
        border-radius: 3px;
        font-size: 0.8em;
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

  private readonly configured = signal(false);
  readonly visible = computed(() => !!this.session.me() && this.configured());

  readonly open = signal(false);
  readonly boing = signal<'in' | 'out' | null>(null);
  private pointerOnDock = false;
  private ignoreHoverUntilLeave = false;
  readonly chatMessages = signal<HelpAgentChatMessage[]>([]);
  readonly chatInput = new FormControl('', { nonNullable: true });
  readonly chatSending = signal(false);
  readonly copied = signal(false);

  private readonly chatLogEl = viewChild<ElementRef<HTMLDivElement>>('chatLog');
  private readonly chatInputEl = viewChild<ElementRef<HTMLTextAreaElement>>('chatInputEl');

  async ngOnInit() {
    // ShellComponent already awaits session.getReady() before rendering,
    // but await defensively here too in case this component ever mounts
    // somewhere that doesn't guarantee that ordering.
    await this.session.getReady();
    const me = this.session.me();
    if (!me) return;

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

    this.chatMessages.update((msgs) => [...msgs, { role: 'user', text: message }]);
    this.persistChat();
    this.chatInput.setValue('');
    this.resetPromptHeight();
    this.chatSending.set(true);
    this.scrollLastMessageIntoView();
    try {
      const res = await this.api.post<{ answer: string }>('/help-agent/ask', { message });
      this.chatMessages.update((msgs) => [...msgs, { role: 'assistant', text: res.answer }]);
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Failed to reach the Help Agent';
      this.chatMessages.update((msgs) => [...msgs, { role: 'assistant', text: `Error: ${detail}` }]);
    } finally {
      this.persistChat();
      this.chatSending.set(false);
      this.scrollLastMessageIntoView();
    }
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
    this.open.set(next);
    this.boing.set(null);
    this.ignoreHoverUntilLeave = !next && this.pointerOnDock;
    this.persistChat();
  }

  onDockEnter() {
    this.pointerOnDock = true;
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
      this.chatMessages.set(messages);
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
