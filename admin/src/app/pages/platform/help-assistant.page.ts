import { Component, inject, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';

interface HelpAgentSettingsView {
  configured: boolean;
  provider: string | null;
  model: string | null;
  keyLastFour: string | null;
  updatedAt: string | null;
}

/** Super users only: configure the in-app Back Office Guide (provider, model, API key). */
@Component({
  selector: 'app-help-assistant-page',
  standalone: true,
  imports: [ReactiveFormsModule, PageComponent, ButtonModule, InputTextModule, MessageModule, SelectModule],
  template: `
    <app-page title="Guide setup" [skipTitle]="true">
      <div class="card">
        <h2 class="page-title page-title-in-card">Back Office Guide</h2>
        <p class="text-color-secondary mt-0 mb-3">
          The Guide answers “where do I click?” questions from the maintained help files in
          <code>docs/help-guide/</code>.           Every signed-in back-office user sees <strong>JD</strong> (the guide avatar) in the
          <strong>bottom-left</strong> once this is configured. The API key is encrypted at rest and never
          shown again after saving.
        </p>
        @if (error()) {
          <p-message severity="error" [text]="error()!" styleClass="mb-3 w-full" />
        }
        @if (saved()) {
          <p-message severity="success" text="Saved and connection verified." styleClass="mb-3 w-full" />
        }
        <form [formGroup]="form" class="form-stack" (ngSubmit)="save()">
          <div class="showcase-flex-col">
            <div class="showcase-row">
              <div class="form-field showcase-half">
                <label for="provider">Provider</label>
                <p-select
                  inputId="provider"
                  formControlName="provider"
                  [options]="providerOptions"
                  optionLabel="label"
                  optionValue="value"
                  styleClass="w-full"
                  appendTo="body"
                />
              </div>
              <div class="form-field showcase-half">
                <label for="model">Model <span class="required-dot" aria-hidden="true"></span></label>
                <input
                  pInputText
                  id="model"
                  class="w-full"
                  formControlName="model"
                  placeholder="e.g. claude-sonnet-5-5"
                  autocomplete="off"
                />
              </div>
            </div>
            <div class="form-field showcase-full">
              <label for="apiKey">API key</label>
              <input
                pInputText
                type="password"
                id="apiKey"
                class="w-full"
                formControlName="apiKey"
                [placeholder]="keyPlaceholder()"
                autocomplete="off"
              />
            </div>
          </div>
          <div class="mt-3">
            <button
              pButton
              type="submit"
              label="Save & test connection"
              [loading]="saving()"
              [disabled]="form.invalid || saving()"
            ></button>
          </div>
        </form>
      </div>
    </app-page>
  `,
})
export class HelpAssistantPage implements OnInit {
  private readonly api = inject(ApiService);

  readonly providerOptions = [
    { label: 'Anthropic (Claude)', value: 'ANTHROPIC' },
    { label: 'OpenAI', value: 'OPENAI' },
    { label: 'Google (Gemini)', value: 'GEMINI' },
  ];

  readonly form = new FormGroup({
    provider: new FormControl('ANTHROPIC', { nonNullable: true, validators: [Validators.required] }),
    model: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    apiKey: new FormControl('', { nonNullable: true }),
  });

  readonly settings = signal<HelpAgentSettingsView | null>(null);
  readonly error = signal<string | null>(null);
  readonly saved = signal(false);
  readonly saving = signal(false);

  async ngOnInit() {
    await this.load();
  }

  keyPlaceholder(): string {
    const s = this.settings();
    if (s?.keyLastFour) return `Configured (ending in ${s.keyLastFour}); leave blank to keep`;
    return 'Paste API key';
  }

  async load() {
    this.error.set(null);
    try {
      const settings = await this.api.get<HelpAgentSettingsView>('/help-agent/settings');
      this.settings.set(settings);
      this.form.patchValue({
        provider: settings.provider ?? 'ANTHROPIC',
        model: settings.model ?? '',
        apiKey: '',
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load settings');
    }
  }

  async save() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set(null);
    this.saved.set(false);
    const v = this.form.getRawValue();
    try {
      const body: { provider: string; model: string; apiKey?: string } = {
        provider: v.provider,
        model: v.model.trim(),
      };
      if (v.apiKey.trim()) body.apiKey = v.apiKey.trim();
      const settings = await this.api.put<HelpAgentSettingsView>('/help-agent/settings', body);
      this.settings.set(settings);
      this.form.patchValue({ apiKey: '' });
      this.saved.set(true);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Save failed');
    } finally {
      this.saving.set(false);
    }
  }
}
