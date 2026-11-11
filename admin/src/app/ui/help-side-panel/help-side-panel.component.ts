import { Component, DestroyRef, effect, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { HELP_AGENT_NAME } from '@upstart/back-office/shared';
import { HelpSidePanelService } from '../../core/help-side-panel.service';
import { SupportFeedbackModalComponent } from '../support-feedback-modal/support-feedback-modal.component';
import { HelpAgentChatPaneComponent } from '../help-agent-widget/help-agent-chat-pane.component';
import { type HelpArticle, getHelpArticle } from '../help-drawer/help-content';

/**
 * Right-hand panel for page help (?) and Back Office guide chat. Non-modal overlay below the top bar.
 */
@Component({
  selector: 'app-help-side-panel',
  standalone: true,
  imports: [DrawerModule, ButtonModule, SupportFeedbackModalComponent, HelpAgentChatPaneComponent],
  styles: [
    `
      :host {
        display: contents;
      }
    `,
  ],
  template: `
    <app-support-feedback-modal #feedbackModal />

    <p-drawer
      [visible]="panel.open()"
      (visibleChange)="onDrawerVisible($event)"
      position="right"
      appendTo="body"
      [style]="{ width: '26.5rem', top: '4.5rem', height: 'calc(100vh - 4.5rem)' }"
      [modal]="false"
      styleClass="help-drawer"
      [closeButtonProps]="drawerCloseButtonProps"
    >
      <ng-template pTemplate="header">
        <div class="help-side-panel-header">
          <div class="help-side-panel-mode" role="tablist" aria-label="Help panel">
            <button
              type="button"
              class="help-side-panel-mode-btn"
              [class.help-side-panel-mode-btn--active]="panel.mode() === 'article'"
              role="tab"
              [attr.aria-selected]="panel.mode() === 'article'"
              (click)="panel.setMode('article')"
            >
              <i class="pi pi-question-circle" aria-hidden="true"></i>
              This page
            </button>
            @if (panel.guideConfigured()) {
              <button
                type="button"
                class="help-side-panel-mode-btn"
                [class.help-side-panel-mode-btn--active]="panel.mode() === 'guide'"
                role="tab"
                [attr.aria-selected]="panel.mode() === 'guide'"
                (click)="panel.setMode('guide')"
              >
                <img class="help-side-panel-mode-avatar" [src]="guideAvatarSrc" alt="" aria-hidden="true" />
                Ask {{ agentName }}
              </button>
            }
          </div>
        </div>
      </ng-template>

      <div class="help-side-panel-body" data-help-agent-ui>
        <div class="help-article-pane" [class.help-article-pane--hidden]="panel.mode() !== 'article'">
            <div class="help-content-scroll">
              @if (article(); as a) {
                @if (a.intro) {
                  <p class="text-color-secondary mb-4">{{ a.intro }}</p>
                }
                @for (section of a.sections; track section.heading) {
                  <div class="help-section">
                    <p class="m-0 mb-1"><strong>{{ section.heading }}</strong></p>
                    <p class="m-0">{{ section.body }}</p>
                  </div>
                }
              } @else {
                <div class="help-fallback">
                  <p class="m-0 mb-3 text-color-secondary"><i class="pi pi-question-circle"></i></p>
                  <p class="m-0 mb-2"><strong>How can we help?</strong></p>
                  <p class="m-0 text-color-secondary">
                    We don't have a guide for this page yet. Use the button below to send us a message.
                  </p>
                </div>
              }
            </div>

            <div class="help-footer">
              <p class="m-0 mb-1"><strong>Still have questions?</strong></p>
              <p class="m-0 mb-3 text-color-secondary">Send us a message and we'll get back to you by email.</p>
              <p-button
                label="Contact Support"
                icon="pi pi-envelope"
                [style]="{ width: '100%', justifyContent: 'center' }"
                (onClick)="openFeedback()"
              />
            </div>
        </div>
        <div class="help-guide-pane" [class.help-guide-pane--hidden]="panel.mode() !== 'guide'">
          <app-help-agent-chat-pane />
        </div>
      </div>
    </p-drawer>
  `,
})
export class HelpSidePanelComponent {
  protected readonly panel = inject(HelpSidePanelService);
  private readonly router = inject(Router);

  /** Avoid Prime's rounded × (circular focus ring on refresh / autofocus). */
  protected readonly drawerCloseButtonProps = {
    severity: 'secondary' as const,
    text: true,
    rounded: false,
    autofocus: false,
  };

  @ViewChild('feedbackModal') private feedbackModal!: SupportFeedbackModalComponent;

  readonly agentName = HELP_AGENT_NAME;
  readonly guideAvatarSrc = '/images/guide-jd-avatar.png';
  protected readonly article = signal<HelpArticle | null>(null);

  constructor() {
    this.article.set(getHelpArticle(this.router.url));
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => this.article.set(getHelpArticle(e.urlAfterRedirects)));

    effect(() => {
      if (this.panel.open() && this.panel.mode() === 'article') {
        this.article.set(getHelpArticle(this.router.url));
      }
    });
  }

  onDrawerVisible(next: boolean): void {
    if (!next) this.panel.close();
  }

  protected openFeedback(): void {
    this.panel.close();
    setTimeout(() => this.feedbackModal.open(), 200);
  }
}
