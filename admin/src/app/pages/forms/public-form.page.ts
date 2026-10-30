import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import type { FormPublicFormDto, FormPublicLinkDto, FormPublicSubmitResultDto, FormResultDto } from '@upstart/back-office/shared';
import { environment } from '../../../environments/environment';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';

type Step = 'loading' | 'error' | 'passcode' | 'email' | 'code' | 'form' | 'done';

/**
 * Public Care form (/care-form/:token): a new intake, or one organization's form (e.g. for family to
 * update). Some links need a passcode or an emailed code first.
 */
@Component({
  selector: 'app-public-form-page',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, AccordionModule, ButtonModule, InputTextModule, MessageModule, TabsModule, FormFieldInputComponent],
  styleUrls: ['../login/login.page.scss', '../task-form/task-form.page.scss'],
  template: `
    <div class="login-page">
      <div class="login-card card task-form-card">
        <div class="login-header">
          @if (info(); as i) {
            <p>{{ i.organizationName }}</p>
          }
        </div>

        @switch (step()) {
          @case ('loading') {
            <p class="text-center text-color-secondary"><i class="pi pi-spin pi-spinner"></i></p>
          }
          @case ('error') {
            <p-message severity="error" styleClass="w-full" [text]="error()!" />
          }
          @case ('passcode') {
            <h2 class="page-title task-form-title">{{ info()?.formName }}</h2>
            <p class="text-color-secondary mb-3">Enter the passcode you were given.</p>
            <form class="login-form" (ngSubmit)="sendPasscode()">
              <div class="form-field mb-3">
                <label for="cpPasscode">Passcode</label>
                <input pInputText id="cpPasscode" name="passcode" class="w-full" type="password" [(ngModel)]="passcode" autocomplete="off" />
              </div>
              @if (error()) { <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" /> }
              <div class="login-actions"><p-button type="submit" label="Continue" [loading]="busy()" [disabled]="!passcode.trim()" /></div>
            </form>
          }
          @case ('email') {
            <h2 class="page-title task-form-title">{{ info()?.formName }}</h2>
            @if (info()?.maskedEmail) {
              <p class="text-color-secondary mb-3">We'll email a code to {{ info()?.maskedEmail }}.</p>
            } @else {
              <p class="text-color-secondary mb-3">Enter your email address and we'll send you a code.</p>
            }
            <form class="login-form" (ngSubmit)="sendCode()">
              @if (!info()?.maskedEmail) {
                <div class="form-field mb-3">
                  <label for="cpEmail">Your email</label>
                  <input pInputText id="cpEmail" name="email" type="email" class="w-full" [(ngModel)]="email" autocomplete="email" />
                </div>
              }
              @if (error()) { <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" /> }
              <div class="login-actions"><p-button type="submit" label="Send code" [loading]="busy()" [disabled]="!info()?.maskedEmail && !email.trim()" /></div>
            </form>
          }
          @case ('code') {
            <h2 class="page-title task-form-title">{{ info()?.formName }}</h2>
            <p class="text-color-secondary mb-3">We sent a code to {{ codeSentTo() }}. It works for 10 minutes.</p>
            <form class="login-form" (ngSubmit)="verifyCode()">
              <div class="form-field mb-3">
                <label for="cpCode">Code</label>
                <input pInputText id="cpCode" name="code" class="w-full" inputmode="numeric" [(ngModel)]="code" autocomplete="one-time-code" />
              </div>
              @if (error()) { <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" /> }
              <div class="login-actions">
                <p-button type="submit" label="Continue" [loading]="busy()" [disabled]="!code.trim()" />
                <p-button label="Send a new code" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="step.set('email')" />
              </div>
            </form>
          }
          @case ('form') {
            <h2 class="page-title task-form-title">{{ info()?.formName }}@if (info()?.clientName) {: {{ info()?.clientName }}}</h2>
            @if (info()?.description) {
              <p class="text-color-secondary task-form-intro">{{ info()?.description }}</p>
            } @else {
              <div class="mb-3"></div>
            }
            <form class="login-form" (ngSubmit)="submit()">
              @if (layout() !== 'steps') {
                <ng-container *ngTemplateOutlet="whoTpl" />
              }
              @switch (layout()) {
                @case ('steps') {
                  @if (stepSection(); as sec) {
                    <p class="cp-step">Step {{ sectionStep() + 1 }} of {{ stepCount() }}</p>
                    <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec }" />
                  } @else {
                    <h3 class="cp-section">About you</h3>
                    <ng-container *ngTemplateOutlet="whoTpl" />
                  }
                }
                @case ('accordion') {
                  <p-accordion [(value)]="openSection">
                    @for (sec of form()?.sections ?? []; track sec.id) {
                      <p-accordion-panel [value]="sec.id">
                        <p-accordion-header>{{ sec.name }}</p-accordion-header>
                        <p-accordion-content>
                          <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec, hideTitle: true }" />
                        </p-accordion-content>
                      </p-accordion-panel>
                    }
                  </p-accordion>
                }
                @case ('tabs') {
                  <p-tabs [(value)]="openSection" [scrollable]="true">
                    <p-tablist>
                      @for (sec of form()?.sections ?? []; track sec.id) {
                        <p-tab [value]="sec.id">{{ sec.name }}</p-tab>
                      }
                    </p-tablist>
                    <p-tabpanels>
                      @for (sec of form()?.sections ?? []; track sec.id) {
                        <p-tabpanel [value]="sec.id">
                          <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec, hideTitle: true }" />
                        </p-tabpanel>
                      }
                    </p-tabpanels>
                  </p-tabs>
                }
                @default {
                  @for (sec of form()?.sections ?? []; track sec.id) {
                    <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec }" />
                  }
                }
              }

              <ng-template #whoTpl>
              <div class="flex flex-wrap gap-2 mb-3">
                  <div class="form-field flex-1">
                    <label for="cpName">Your name@if (isIntake()) {<span class="task-form-required">*</span>}</label>
                    <input pInputText id="cpName" name="name" class="w-full" [(ngModel)]="name" autocomplete="name" />
                  </div>
                  @if (isIntake()) {
                    <div class="form-field flex-1">
                      <label for="cpEmail2">Your email<span class="task-form-required">*</span></label>
                      <input pInputText id="cpEmail2" name="email2" type="email" class="w-full" [(ngModel)]="email" [readonly]="!!form()?.verifiedEmail" autocomplete="email" />
                    </div>
                    @if (info()?.ask?.organization) {
                      <div class="form-field flex-1">
                        <label for="cpOrg">Organization<span class="task-form-required">*</span></label>
                        <input pInputText id="cpOrg" name="organization" class="w-full" [(ngModel)]="organization" autocomplete="organization" />
                      </div>
                    }
                    @if (info()?.ask?.phone) {
                      <div class="form-field flex-1">
                        <label for="cpPhone">Phone</label>
                        <input pInputText id="cpPhone" name="phone" class="w-full" [(ngModel)]="phone" autocomplete="tel" />
                      </div>
                    }
                  }
                </div>
              </ng-template>

              <ng-template #sectionTpl let-sec let-hideTitle="hideTitle">
                @if (!hideTitle) {
                  <h3 class="cp-section">{{ sec.name }}</h3>
                }
                @if (sec.description) {
                  <p class="text-color-secondary cp-intro">{{ sec.description }}</p>
                }
                @for (f of sec.fields; track f.id) {
                  <app-form-field-input class="mb-3" [field]="f" [value]="values[f.id] ?? null" (valueChange)="values[f.id] = $event" [showRequired]="true" />
                }
              </ng-template>
              <div class="task-form-hp" aria-hidden="true">
                <label for="cp-website">Website</label>
                <input id="cp-website" name="website" tabindex="-1" autocomplete="off" [(ngModel)]="website" />
              </div>
              @if (error()) { <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" /> }
              <div class="login-actions">
                @if (layout() === 'steps' && sectionStep() > 0) {
                  <p-button label="Back" severity="secondary" [outlined]="true" (onClick)="back()" />
                }
                @if (layout() === 'steps' && sectionStep() < stepCount() - 1) {
                  <p-button label="Next" (onClick)="next()" />
                } @else {
                  <p-button type="submit" label="Send" [loading]="busy()" />
                }
              </div>
            </form>
          }
          @case ('done') {
            <div class="task-form-done">
              <i class="pi pi-check-circle"></i>
              <h2 class="page-title task-form-title">Sent</h2>
              <p class="text-color-secondary mb-0">{{ doneMessage() }}</p>
            </div>
            @if (result(); as r) {
              <div class="cp-result">
                <p class="cp-result-score">{{ round(r.percent) }}%</p>
                @if (r.band; as b) {
                  <h3 class="cp-section">{{ b.label }}</h3>
                  @if (b.description) {
                    <p class="text-color-secondary">{{ b.description }}</p>
                  }
                  @if (b.nextSteps.length) {
                    <h3 class="cp-section">Recommended next steps</h3>
                    <ul class="cp-result-list">
                      @for (n of b.nextSteps; track $index) {
                        <li>{{ n }}</li>
                      }
                    </ul>
                  }
                  @if (b.assetUrl) {
                    <p><a [href]="b.assetUrl" target="_blank" rel="noopener">{{ b.assetLabel || 'Download your guide' }}</a></p>
                  }
                }
                @if (r.groups.length) {
                  <h3 class="cp-section">By area</h3>
                  @for (g of r.groups; track g.id) {
                    <div class="cp-result-row"><span>{{ g.name }}</span><strong>{{ round(g.percent) }}%</strong></div>
                  }
                }
                @if (r.cta; as c) {
                  <div class="login-actions mt-3"><a pButton [href]="c.url" [label]="c.label"></a></div>
                }
              </div>
            }
          }
        }
      </div>
    </div>
  `,
  styles: `
    .cp-result {
      margin-top: 1.5rem;
    }
    .cp-result-score {
      font-size: 2.5rem;
      font-weight: 700;
      text-align: center;
      margin: 0;
    }
    .cp-result-list {
      margin: 0 0 1rem;
      padding-left: 1.25rem;
    }
    .cp-result-row {
      display: flex;
      justify-content: space-between;
      padding: 0.25rem 0;
    }
    .cp-step {
      color: var(--text-color-secondary);
      margin: 0 0 0.25rem;
    }
    .cp-intro {
      margin: -0.25rem 0 1rem;
    }
    .cp-section {
      font-size: var(--fs-md);
      font-weight: 600;
      margin: 1.25rem 0 0.75rem;
    }
  `,
})
/**
 * The public page for any form link (Care's /care-form/:token and /form/:token): optional passcode or emailed
 * code, the form, then thanks. Scored forms also show the results.
 */
export class PublicFormPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';
  private readonly base = `${environment.apiBaseUrl}/form-links/${encodeURIComponent(this.token)}`;

  step = signal<Step>('loading');
  info = signal<FormPublicLinkDto | null>(null);
  form = signal<FormPublicFormDto | null>(null);
  error = signal<string | null>(null);
  busy = signal(false);
  codeSentTo = signal('');
  doneMessage = signal('');
  result = signal<FormResultDto | null>(null);

  private accessToken: string | null = null;
  private challengeId: string | null = null;
  passcode = '';
  email = '';
  code = '';
  name = '';
  phone = '';
  organization = '';
  website = '';
  values: Record<string, unknown> = {};

  /** How the form's sections are shown (set on the form in UBO). */
  readonly layout = computed(() => this.form()?.layout ?? 'page');
  /** Steps: the section shown (the last step is "About you" on new-response links). */
  readonly sectionStep = signal(0);
  readonly stepCount = computed(() => (this.form()?.sections.length ?? 0) + (this.isIntake() ? 1 : 0));
  readonly stepSection = computed(() => this.form()?.sections[this.sectionStep()] ?? null);
  /** Accordion and tabs: the open section. */
  openSection: string | number | undefined = undefined;

  next() {
    const sec = this.stepSection();
    const missing = sec?.fields.find((f) => f.required && isEmpty(this.values[f.id]));
    if (missing) {
      this.error.set(`${missing.name}: required`);
      return;
    }
    this.error.set(null);
    this.sectionStep.update((n) => Math.min(n + 1, this.stepCount() - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  back() {
    this.error.set(null);
    this.sectionStep.update((n) => Math.max(0, n - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  round(n: number) {
    return Math.round(n);
  }

  isIntake() {
    return this.info()?.kind === 'NEW';
  }

  async ngOnInit() {
    try {
      const info = await this.call<FormPublicLinkDto>('GET', '');
      this.info.set(info);
      if (info.verify === 'PASSCODE') this.step.set('passcode');
      else if (info.verify === 'EMAIL_CODE') this.step.set('email');
      else await this.loadForm();
    } catch (err) {
      this.fail(err, true);
    }
  }

  async sendPasscode() {
    await this.run(async () => {
      const r = await this.call<{ accessToken: string }>('POST', '/passcode', { passcode: this.passcode.trim() });
      this.accessToken = r.accessToken;
      await this.loadForm();
    });
  }

  async sendCode() {
    await this.run(async () => {
      const r = await this.call<{ challengeId: string; maskedEmail: string }>('POST', '/send-code', this.info()?.maskedEmail ? {} : { email: this.email.trim() });
      this.challengeId = r.challengeId;
      this.codeSentTo.set(r.maskedEmail);
      this.code = '';
      this.step.set('code');
    });
  }

  async verifyCode() {
    await this.run(async () => {
      const r = await this.call<{ accessToken: string }>('POST', '/verify-code', { challengeId: this.challengeId, code: this.code.trim() });
      this.accessToken = r.accessToken;
      await this.loadForm();
    });
  }

  async submit() {
    // Enter on an earlier step moves on instead of sending.
    if (this.layout() === 'steps' && this.sectionStep() < this.stepCount() - 1) {
      this.next();
      return;
    }
    await this.run(async () => {
      const r = await this.call<FormPublicSubmitResultDto>('POST', '/submit', {
        values: this.values,
        submitter: { name: this.name.trim(), email: this.email.trim(), phone: this.phone.trim(), organization: this.organization.trim() },
        website: this.website,
      });
      this.doneMessage.set(r.message);
      if (r.resultToken) {
        try {
          const res = await fetch(`${environment.apiBaseUrl}/form-results/${encodeURIComponent(r.resultToken)}`);
          if (res.ok) this.result.set((await res.json()) as FormResultDto);
        } catch {
          // The thanks message is enough when results can't load.
        }
      }
      this.step.set('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  private async loadForm() {
    const f = await this.call<FormPublicFormDto>('GET', '/form');
    this.form.set(f);
    this.values = { ...f.values };
    this.sectionStep.set(0);
    this.openSection = f.sections[0]?.id;
    if (f.verifiedEmail) this.email = f.verifiedEmail;
    this.error.set(null);
    this.step.set('form');
  }

  private async run(fn: () => Promise<void>) {
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (err) {
      this.fail(err, false);
    } finally {
      this.busy.set(false);
    }
  }

  private fail(err: unknown, fatal: boolean) {
    const e = err as Error & { status?: number };
    this.error.set(e?.message || 'Something went wrong');
    // An expired verification sends people back to verify again.
    if (e?.status === 401 && this.info() && this.step() === 'form') {
      this.accessToken = null;
      this.step.set(this.info()!.verify === 'PASSCODE' ? 'passcode' : 'email');
      return;
    }
    if (fatal || e?.status === 404 || e?.status === 410) this.step.set('error');
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.accessToken) headers['X-Form-Access'] = this.accessToken;
    const res = await fetch(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = Array.isArray(json?.message) ? json.message.join(', ') : json?.message;
      throw Object.assign(new Error(msg || 'Something went wrong'), { status: res.status });
    }
    return json as T;
  }
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}
