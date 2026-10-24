import { Component, DestroyRef, inject, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { SupportFeedbackModalComponent } from '../support-feedback-modal/support-feedback-modal.component';
import { type HelpArticle, getHelpArticle } from './help-content';

/**
 * Right-hand help panel opened from the top bar (?). Shows the article for the current route
 * (see help-content.ts) and a Contact Support footer. Non-modal overlay: it sits over the page
 * (no layout shift) and starts just below the fixed 4.5rem top bar.
 */
@Component({
  selector: 'app-help-drawer',
  standalone: true,
  imports: [DrawerModule, ButtonModule, SupportFeedbackModalComponent],
  styles: [
    `
      /* Rendered inside the top bar: take no space there, so the icons' spacing doesn't change. */
      :host {
        position: absolute;
        width: 0;
        height: 0;
        overflow: visible;
      }
      .help-drawer-body {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .help-content-scroll {
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 0 1.25rem 1.25rem;
      }
      .help-intro {
        color: var(--color-text-muted);
        margin: 0 0 1.25rem;
        line-height: 1.6;
      }
      .help-section {
        margin-bottom: 1.25rem;
      }
      .help-section-heading {
        font-weight: 600;
        margin-bottom: 0.35rem;
      }
      .help-section-body {
        line-height: 1.65;
        color: var(--color-text);
      }
      .help-fallback {
        padding-top: 2rem;
        text-align: center;
      }
      .help-fallback-icon {
        font-size: 2.25rem; /* icon only */
        color: var(--color-text-muted);
        margin-bottom: 0.75rem;
      }
      .help-fallback-title {
        font-weight: 600;
        margin-bottom: 0.5rem;
      }
      .help-fallback-body {
        color: var(--color-text-muted);
        line-height: 1.6;
      }
      .help-footer {
        flex: 0 0 auto;
        padding: 1rem 1.25rem 1.25rem;
        border-top: 1px solid var(--surface-border);
        background: var(--surface-ground);
      }
      .help-footer-label {
        font-weight: 600;
        margin: 0 0 0.25rem;
      }
      .help-footer-hint {
        color: var(--color-text-muted);
        margin: 0 0 0.75rem;
        line-height: 1.5;
      }
    `,
  ],
  template: `
    <app-support-feedback-modal #feedbackModal />

    <p-drawer
      [(visible)]="visible"
      position="right"
      appendTo="body"
      [style]="{ width: '26.5rem', top: '4.5rem', height: 'calc(100vh - 4.5rem)' }"
      [modal]="false"
      [header]="article()?.title ?? 'How can we help?'"
      styleClass="help-drawer"
    >
      <div class="help-drawer-body">
        <div class="help-content-scroll">
          @if (article(); as a) {
            @if (a.intro) {
              <p class="help-intro">{{ a.intro }}</p>
            }
            @for (section of a.sections; track section.heading) {
              <div class="help-section">
                <div class="help-section-heading">{{ section.heading }}</div>
                <div class="help-section-body">{{ section.body }}</div>
              </div>
            }
          } @else {
            <div class="help-fallback">
              <div class="help-fallback-icon"><i class="pi pi-question-circle"></i></div>
              <div class="help-fallback-title">How can we help?</div>
              <p class="help-fallback-body">
                We don't have a guide for this page yet. Use the button below to send us a message.
              </p>
            </div>
          }
        </div>

        <div class="help-footer">
          <p class="help-footer-label">Still have questions?</p>
          <p class="help-footer-hint">Send us a message and we'll get back to you by email.</p>
          <p-button
            label="Contact Support"
            icon="pi pi-envelope"
            [style]="{ width: '100%', justifyContent: 'center' }"
            (onClick)="openFeedback()"
          />
        </div>
      </div>
    </p-drawer>
  `,
})
export class HelpDrawerComponent {
  private readonly router = inject(Router);

  @ViewChild('feedbackModal') private feedbackModal!: SupportFeedbackModalComponent;

  protected visible = false;
  protected readonly article = signal<HelpArticle | null>(null);

  constructor() {
    // Keep the article in sync when the user navigates with the drawer open.
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => this.article.set(getHelpArticle(e.urlAfterRedirects)));
  }

  get isOpen(): boolean {
    return this.visible;
  }

  open(): void {
    this.article.set(getHelpArticle(this.router.url));
    this.visible = true;
  }

  close(): void {
    this.visible = false;
  }

  toggle(): void {
    if (this.visible) this.close();
    else this.open();
  }

  protected openFeedback(): void {
    this.close();
    // Let the drawer close animation finish before the dialog opens.
    setTimeout(() => this.feedbackModal.open(), 200);
  }
}
