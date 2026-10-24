import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SUPPORT_FEEDBACK_TOPIC_IDS,
  SUPPORT_FEEDBACK_TOPIC_LABELS,
  type SupportClientEnvironment,
  type SupportFeedbackSubmit,
  type SupportFeedbackTopicId,
} from '@upstart/back-office/shared';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';

function buildClientEnvironment(): SupportClientEnvironment {
  const languages = Array.from(navigator.languages?.length ? navigator.languages : [navigator.language]);
  return {
    href: window.location?.href ?? '',
    language: navigator.language,
    languages,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '',
    screenWidth: window.screen?.width ?? 0,
    screenHeight: window.screen?.height ?? 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    platform: navigator.platform ?? '',
    cookieEnabled: navigator.cookieEnabled,
    devicePixelRatio: window.devicePixelRatio,
  };
}

/** "Contact Support" dialog opened from the help drawer footer. Emails support@heyupstart.com. */
@Component({
  selector: 'app-support-feedback-modal',
  standalone: true,
  imports: [FormsModule, AppDialogModule, ButtonModule, CheckboxModule, TextareaModule, MessageModule],
  styles: [
    `
      :host {
        position: absolute;
        width: 0;
        height: 0;
        overflow: visible;
      }
      .support-form {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .support-hint {
        margin: 0;
        color: var(--color-text-muted);
        line-height: 1.5;
      }
      .support-label {
        display: block;
        font-weight: 600;
        margin-bottom: 0.5rem;
      }
      .support-topics {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
        gap: 0.5rem 1rem;
      }
      .support-topic {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
    `,
  ],
  template: `
    <p-dialog
      [(visible)]="visible"
      appendTo="body"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [closable]="!submitting()"
      [style]="{ width: 'min(34rem, 96vw)' }"
      [header]="submitted() ? 'Thanks — we got it' : 'Contact Support'"
      (onHide)="reset()"
    >
      @if (!submitted()) {
        <div class="support-form">
          <p class="support-hint">
            Tell us what's going on. We'll reply by email. The page you're on and your browser details are
            included automatically.
          </p>
          @if (error()) {
            <p-message severity="error" [text]="error()!" />
          }
          <div>
            <span class="support-label" id="support-topics-label">What's this about?</span>
            <div class="support-topics" role="group" aria-labelledby="support-topics-label">
              @for (opt of topicOptions; track opt.value) {
                <label class="support-topic">
                  <p-checkbox
                    [binary]="true"
                    [ngModel]="isSelected(opt.value)"
                    (ngModelChange)="toggle(opt.value)"
                    [disabled]="submitting()"
                  />
                  <span>{{ opt.label }}</span>
                </label>
              }
            </div>
          </div>
          <div>
            <label class="support-label" for="support-message">Message</label>
            <textarea
              pTextarea
              id="support-message"
              [(ngModel)]="message"
              [rows]="6"
              class="w-full"
              [disabled]="submitting()"
              placeholder="What were you trying to do, and what happened?"
            ></textarea>
          </div>
        </div>
      } @else {
        <p class="support-hint">We'll get back to you at your sign-in email address.</p>
      }
      <ng-template pTemplate="footer">
        @if (!submitted()) {
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="submitting()" (onClick)="close()" />
          <p-button label="Send" icon="pi pi-send" [loading]="submitting()" (onClick)="submit()" />
        } @else {
          <p-button label="Close" (onClick)="close()" />
        }
      </ng-template>
    </p-dialog>
  `,
})
export class SupportFeedbackModalComponent {
  private readonly api = inject(ApiService);

  protected visible = false;
  protected readonly submitted = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly topicOptions = SUPPORT_FEEDBACK_TOPIC_IDS.map((value) => ({
    value,
    label: SUPPORT_FEEDBACK_TOPIC_LABELS[value],
  }));

  protected selected = new Set<SupportFeedbackTopicId>();
  protected message = '';

  open(): void {
    this.reset();
    this.visible = true;
  }

  close(): void {
    this.visible = false;
  }

  protected isSelected(id: SupportFeedbackTopicId): boolean {
    return this.selected.has(id);
  }

  protected toggle(id: SupportFeedbackTopicId): void {
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
  }

  protected reset(): void {
    this.submitted.set(false);
    this.submitting.set(false);
    this.error.set(null);
    this.selected = new Set();
    this.message = '';
  }

  protected async submit(): Promise<void> {
    if (!this.selected.size) {
      this.error.set('Pick at least one topic.');
      return;
    }
    const message = this.message.trim();
    if (!message) {
      this.error.set('Add a short message so we know how to help.');
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    try {
      const body: SupportFeedbackSubmit = {
        topicIds: Array.from(this.selected),
        message,
        clientEnvironment: buildClientEnvironment(),
      };
      await this.api.post('/support/feedback', body);
      this.submitted.set(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message.replace(/^API error \d+:\s*/, '') : '';
      this.error.set(msg || 'Something went wrong. Please try again.');
    } finally {
      this.submitting.set(false);
    }
  }
}
