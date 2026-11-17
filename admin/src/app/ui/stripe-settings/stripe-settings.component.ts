import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { HelpTextComponent } from '../help-text/help-text.component';

type StripeStatus = { configured: boolean; connectedAt: string | null };
type StripeConfig = {
  publishableKey: string;
  hasSecretKey: boolean;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  configured: boolean;
};

@Component({
  selector: 'app-stripe-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, TagModule, HelpTextComponent],
  template: `
    @if (loading()) {
      <p class="text-color-secondary">Loading…</p>
    } @else {
      <div class="showcase-flex-col mb-4">
        <div class="form-field showcase-full">
          <label for="stripePublishable">Publishable key <app-help-text key="settings.stripe.publishable" /></label>
          <input
            pInputText
            id="stripePublishable"
            class="w-full"
            [(ngModel)]="form.publishableKey"
            name="stripePublishable"
            autocomplete="off"
            placeholder="pk_live_… or pk_test_…"
          />
        </div>
        <div class="form-field showcase-full">
          <label for="stripeSecret">Secret key</label>
          <input
            pInputText
            id="stripeSecret"
            type="password"
            class="w-full"
            [(ngModel)]="form.secretKey"
            name="stripeSecret"
            [placeholder]="config()?.hasSecretKey ? 'Leave blank to keep existing secret' : 'sk_live_… or sk_test_…'"
            autocomplete="new-password"
          />
        </div>
        <div class="form-field showcase-full">
          <label for="stripeWebhook">Webhook signing secret <app-help-text key="settings.stripe.webhook" /></label>
          <input
            pInputText
            id="stripeWebhook"
            type="password"
            class="w-full"
            [(ngModel)]="form.webhookSecret"
            name="stripeWebhook"
            [placeholder]="config()?.hasWebhookSecret ? 'Leave blank to keep existing secret' : 'whsec_…'"
            autocomplete="new-password"
          />
        </div>
        @if (config()?.webhookUrl) {
          <div class="form-field showcase-full">
            <label>Webhook URL</label>
            <div class="api-key-row">
              <code class="api-key-value">{{ config()!.webhookUrl }}</code>
              <button type="button" pButton label="Copy" size="small" (click)="copyWebhookUrl()"></button>
            </div>
            <p class="text-sm text-color-secondary mt-2 mb-0">Add this URL in the Stripe Dashboard for this account (events: checkout.session.completed).</p>
          </div>
        }
        <div class="flex flex-wrap gap-2 align-items-center">
          <button type="button" pButton label="Save" [loading]="saving()" (click)="save()"></button>
          @if (status()?.configured) {
            <button type="button" pButton label="Test connection" severity="secondary" [loading]="testing()" (click)="test()"></button>
            <button type="button" pButton label="Disconnect" severity="danger" [text]="true" (click)="disconnect()"></button>
          }
          @if (status()?.configured) {
            <p-tag severity="success" value="Connected" />
          } @else {
            <p-tag severity="secondary" value="Not configured" />
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .api-key-row {
        display: flex;
        align-items: stretch;
        gap: 0.5rem;
      }
      .api-key-value {
        flex: 1 1 auto;
        min-width: 0;
        display: block;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--content-border-radius);
        background: var(--color-background);
        font-size: var(--fs-sm);
        word-break: break-all;
      }
    `,
  ],
})
export class StripeSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);
  private readonly confirmDelete = inject(ConfirmDeleteService);

  status = signal<StripeStatus | null>(null);
  config = signal<StripeConfig | null>(null);
  loading = signal(true);
  saving = signal(false);
  testing = signal(false);

  form = { publishableKey: '', secretKey: '', webhookSecret: '' };

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const [status, config] = await Promise.all([
        this.api.get<StripeStatus>('/stripe/status'),
        this.api.get<StripeConfig>('/stripe/config'),
      ]);
      this.status.set(status);
      this.config.set(config);
      this.form.publishableKey = config.publishableKey ?? '';
      this.form.secretKey = '';
      this.form.webhookSecret = '';
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Stripe',
        detail: err instanceof Error ? err.message : 'Could not load Stripe settings',
        life: 5000,
      });
    } finally {
      this.loading.set(false);
    }
  }

  async save() {
    this.saving.set(true);
    try {
      const config = await this.api.put<StripeConfig>('/stripe/config', {
        publishableKey: this.form.publishableKey.trim(),
        ...(this.form.secretKey.trim() ? { secretKey: this.form.secretKey.trim() } : {}),
        ...(this.form.webhookSecret.trim() ? { webhookSecret: this.form.webhookSecret.trim() } : {}),
      });
      this.config.set(config);
      this.status.set({ configured: config.configured, connectedAt: new Date().toISOString() });
      this.form.secretKey = '';
      this.form.webhookSecret = '';
      this.toast.add({ severity: 'success', summary: 'Stripe saved', life: 3000 });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Save failed',
        detail: err instanceof Error ? err.message : 'Could not save',
        life: 5000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  async test() {
    this.testing.set(true);
    try {
      await this.api.post<{ ok: true }>('/stripe/test');
      this.toast.add({ severity: 'success', summary: 'Stripe connection OK', life: 3000 });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Test failed',
        detail: err instanceof Error ? err.message : 'Could not reach Stripe',
        life: 5000,
      });
    } finally {
      this.testing.set(false);
    }
  }

  disconnect() {
    this.confirmDelete.confirm({
      message: 'Remove Stripe keys for this organization? Invoice pay links will stop accepting cards until you connect again.',
      accept: async () => {
        await this.api.delete('/stripe');
        this.status.set({ configured: false, connectedAt: null });
        this.config.set(null);
        this.form = { publishableKey: '', secretKey: '', webhookSecret: '' };
        this.toast.add({ severity: 'info', summary: 'Stripe disconnected', life: 3000 });
        await this.load();
      },
    });
  }

  copyWebhookUrl() {
    const url = this.config()?.webhookUrl;
    if (!url) return;
    void navigator.clipboard.writeText(url);
    this.toast.add({ severity: 'info', summary: 'Copied webhook URL', life: 2000 });
  }
}