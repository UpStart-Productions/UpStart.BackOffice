import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { TabsModule } from 'primeng/tabs';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import {
  isContentField,
  scoreBandResourceFileName,
  type FormFieldDto,
  type FormFileRef,
  type FormPublicDraftDto,
  type FormPublicFormDto,
  type FormPublicLinkDto,
  type FormPublicSubmitResultDto,
  type FormResultDto,
  type FormSectionDto,
} from '@upstart/back-office/shared';
import { resolveAssetUrl } from '../../core/asset-url.util';
import { environment } from '../../../environments/environment';
import { FormFieldInputComponent } from '../../ui/form-builder/form-field-input.component';
import { PhoneInputComponent } from '../../ui/phone-input/phone-input.component';
import { AutoSaver } from '../../core/auto-saver';
import { SaveStatusComponent } from '../../ui/save-status/save-status.component';

type Step = 'loading' | 'error' | 'passcode' | 'email' | 'code' | 'form' | 'done';
/** One screen of a paged form; `section` null is "About you". */
type PublicPage = { section: FormSectionDto | null; fields: FormFieldDto[]; question: boolean; intro?: string | null };

/**
 * Public Care form (/care-form/:token): a new intake, or one organization's form (e.g. for family to
 * update). Some links need a passcode or an emailed code first.
 */
@Component({
  selector: 'app-public-form-page',
  standalone: true,
  imports: [NgTemplateOutlet, FormsModule, AccordionModule, ButtonModule, InputTextModule, MessageModule, TabsModule, FormFieldInputComponent, PhoneInputComponent, SaveStatusComponent],
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
            @if (info()?.descriptionHtml) {
              <div class="text-color-secondary task-form-intro cp-rich" [innerHTML]="info()?.descriptionHtml"></div>
            } @else if (info()?.description) {
              <p class="text-color-secondary task-form-intro">{{ info()?.description }}</p>
            } @else {
              <div class="mb-3"></div>
            }
            <form class="login-form" (ngSubmit)="submit()">
              @if (!paged()) {
                <ng-container *ngTemplateOutlet="whoTpl" />
              }
              @switch (layout()) {
                @case ('steps') {
                  @if (page(); as pg) {
                    <p class="cp-step">Step {{ sectionStep() + 1 }} of {{ stepCount() }}</p>
                    @if (pg.section) {
                      <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: pg.section }" />
                    } @else {
                      <h3 class="cp-section">About you</h3>
                      <ng-container *ngTemplateOutlet="whoTpl" />
                    }
                  }
                }
                @case ('questions') {
                  @if (page(); as pg) {
                    <div class="cp-progress" aria-hidden="true"><span [style.width.%]="progress()"></span></div>
                    @if (pg.section) {
                      <p class="cp-kicker">
                        {{ pg.section.name }}
                        @if (pg.question) {
                          <span class="cp-count">Question {{ questionNumber() }} of {{ questionCount() }}</span>
                        }
                      </p>
                      @if (pg.intro) {
                        <p class="text-color-secondary cp-intro">{{ pg.intro }}</p>
                      }
                      @for (f of pg.fields; track f.id) {
                        <app-form-field-input class="mb-3" [field]="f" [value]="values[f.id] ?? null" (valueChange)="onChange(f, $event); picked(f)" [showRequired]="true" [choices]="true" [fileUpload]="uploadFile" />
                      }
                    } @else {
                      <p class="cp-kicker">Last step</p>
                      <h3 class="cp-section">About you</h3>
                      <ng-container *ngTemplateOutlet="whoTpl" />
                    }
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
                    <label for="cpName">Your name@if (isIntake()) {<span class="required-dot" aria-hidden="true"></span>}</label>
                    <input pInputText id="cpName" name="name" class="w-full" [(ngModel)]="name" (ngModelChange)="aboutYouChanged()" autocomplete="name" />
                  </div>
                  @if (isIntake()) {
                    <div class="form-field flex-1">
                      <label for="cpEmail2">Your email<span class="required-dot" aria-hidden="true"></span></label>
                      <input pInputText id="cpEmail2" name="email2" type="email" class="w-full" [(ngModel)]="email" (ngModelChange)="aboutYouChanged()" [readonly]="!!form()?.verifiedEmail" autocomplete="email" />
                    </div>
                    @if (info()?.ask?.organization) {
                      <div class="form-field flex-1">
                        <label for="cpOrg">Organization<span class="required-dot" aria-hidden="true"></span></label>
                        <input pInputText id="cpOrg" name="organization" class="w-full" [(ngModel)]="organization" (ngModelChange)="aboutYouChanged()" autocomplete="organization" />
                      </div>
                    }
                    @if (info()?.ask?.phone) {
                      <div class="form-field flex-1">
                        <label for="cpPhone">Phone</label>
                        <app-phone-input inputId="cpPhone" [value]="phone || null" (valueChange)="phone = $event ?? ''; aboutYouChanged()" />
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
                  <app-form-field-input class="mb-3" [field]="f" [value]="values[f.id] ?? null" (valueChange)="onChange(f, $event)" [showRequired]="true" [choices]="true" [fileUpload]="uploadFile" />
                }
              </ng-template>
              <div class="task-form-hp" aria-hidden="true">
                <label for="cp-website">Website</label>
                <input id="cp-website" name="website" tabindex="-1" autocomplete="off" [(ngModel)]="website" />
              </div>
              @if (error()) { <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" /> }
              @if (form()?.submittedAt) {
                <p class="text-color-secondary">This form was submitted. Changes you make still save.</p>
              }
              <div class="login-actions">
                <app-save-status [state]="saver.state()" />
                @if (paged() && sectionStep() > 0) {
                  <p-button label="Back" severity="secondary" [outlined]="true" (onClick)="back()" />
                }
                @if (paged() && sectionStep() < stepCount() - 1) {
                  <p-button label="Next" (onClick)="next()" />
                } @else {
                  <p-button type="submit" [label]="isIntake() ? 'Send' : 'Submit'" [loading]="busy()" />
                }
              </div>
            </form>
          }
          @case ('done') {
            <div class="task-form-done">
              <i class="pi pi-check-circle"></i>
              <h2 class="page-title task-form-title">Sent</h2>
              <div class="text-color-secondary" [innerHTML]="doneMessage()"></div>
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
                  @if (bandAssetHref(b); as href) {
                    <p><a [href]="href" target="_blank" rel="noopener" [attr.download]="b.assetKind === 'file' ? scoreBandResourceFileName(b) : null">{{ b.assetLabel?.trim() || scoreBandResourceFileName(b) }}</a></p>
                  }
                }
                @if (r.groups.length) {
                  <h3 class="cp-section">By area</h3>
                  @for (g of r.groups; track g.id) {
                    <div class="cp-result-row"><span>{{ g.name }}</span><strong>{{ round(g.percent) }}%</strong></div>
                  }
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
    /* Page by question: a slim progress bar, the section name and the question count. */
    .cp-progress {
      height: 4px;
      border-radius: 2px;
      background: var(--surface-border);
      overflow: hidden;
      margin-bottom: 1rem;
    }
    .cp-progress span {
      display: block;
      height: 100%;
      background: var(--p-surface-600, #52525b);
      transition: width 0.25s;
    }
    .cp-kicker {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      margin: 0 0 0.75rem;
      color: var(--text-color-secondary);
      font-size: var(--fs-sm);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .cp-count {
      text-transform: none;
      letter-spacing: 0;
      white-space: nowrap;
    }
    /* A description written in the editor (paragraphs, lists, bold). */
    .cp-rich ::ng-deep p {
      margin: 0 0 0.5rem;
    }
    .cp-rich ::ng-deep p:last-child {
      margin-bottom: 0;
    }
    .cp-rich ::ng-deep ul,
    .cp-rich ::ng-deep ol {
      margin: 0 0 0.5rem;
      padding-left: 1.25rem;
    }
    .cp-section {
      font-size: var(--fs-md);
      font-weight: 600;
      margin: 1.25rem 0 0.75rem;
    }
    .login-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }
    .login-actions .p-button {
      width: auto;
    }
    .form-field label {
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    .required-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: var(--color-error, #d32f2f);
      flex-shrink: 0;
    }
  `,
})
/**
 * The public page for any form link (Care's /care-form/:token and /form/:token): optional passcode or emailed
 * code, the form, then thanks. Scored forms also show the results.
 */
export class PublicFormPage implements OnInit, OnDestroy {
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

  /** New-response links: this browser's auto-saved draft (kept so a closed tab can pick up where it left off). */
  private get draftKey() {
    return `ubo-form-draft:${this.token}`;
  }
  private draftToken: string | null = null;

  /**
   * Auto-save: every answer saves a moment after it changes (picks, checkboxes and files right away). New-response
   * links start a draft on the first answer; client links save into their result. Several people can share a link:
   * each save sends just what changed.
   */
  readonly saver = new AutoSaver<unknown>(async (changes) => {
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) if (k.startsWith('v:')) values[k.slice(2)] = v;
    const r = await this.call<FormPublicDraftDto>('POST', '/draft', {
      ...(this.draftToken ? { draftToken: this.draftToken } : {}),
      values,
      submitter: { name: this.name.trim(), email: this.email.trim(), phone: this.phone.trim(), organization: this.organization.trim() },
    });
    if (r.draftToken && r.draftToken !== this.draftToken) {
      this.draftToken = r.draftToken;
      try {
        localStorage.setItem(this.draftKey, r.draftToken);
      } catch {
        // Saving still works; this browser just won't pick it up again after closing.
      }
    }
  });

  ngOnDestroy() {
    void this.saver.flush().catch(() => undefined);
    this.saver.destroy();
  }

  /** An answer changed: keep it and save it. */
  onChange(f: FormFieldDto, value: unknown) {
    this.values[f.id] = value;
    const typing = f.type === 'TEXT' || f.type === 'LONG_TEXT' || f.type === 'NUMBER' || f.type === 'GROUP';
    this.saver.change(`v:${f.id}`, value ?? null, !typing);
  }

  /** Name, email, phone or organization changed: saved with the draft (only once something is answered). */
  aboutYouChanged() {
    if (this.draftToken || !this.isIntake()) this.saver.change('about', true);
  }

  /** How the form's sections are shown (set on the form in UBO). */
  readonly layout = computed(() => this.form()?.layout ?? 'page');
  /** Page by section or by question: one screen at a time with Back and Next. */
  readonly paged = computed(() => this.layout() === 'steps' || this.layout() === 'questions');
  /**
   * The screens: a section each (Page by section), or a question or text block each (Page by question).
   * New-response links end with "About you" (section null).
   */
  readonly pages = computed<PublicPage[]>(() => {
    const f = this.form();
    if (!f) return [];
    const out: PublicPage[] = [];
    for (const s of f.sections) {
      if (this.layout() === 'questions') {
        if (s.description) out.push({ section: s, fields: [], question: false, intro: s.description });
        for (const fld of s.fields) out.push({ section: s, fields: [fld], question: !isContentField(fld) });
      } else {
        out.push({ section: s, fields: s.fields, question: false });
      }
    }
    if (this.isIntake()) out.push({ section: null, fields: [], question: false });
    return out;
  });
  readonly sectionStep = signal(0);
  readonly stepCount = computed(() => this.pages().length);
  readonly page = computed(() => this.pages()[this.sectionStep()] ?? null);
  readonly questionCount = computed(() => this.pages().filter((p) => p.question).length);
  /** This question's number (questions before it, plus one). */
  readonly questionNumber = computed(() => this.pages().slice(0, this.sectionStep()).filter((p) => p.question).length + 1);
  readonly progress = computed(() => {
    const total = this.questionCount();
    return total ? Math.round(((this.questionNumber() - 1) / total) * 100) : 0;
  });
  /** Accordion and tabs: the open section. */
  openSection: string | number | undefined = undefined;

  next() {
    const missing = this.page()?.fields.find((f) => f.required && !isContentField(f) && isEmpty(this.values[f.id]));
    if (missing) {
      this.error.set(this.layout() === 'questions' ? 'Please answer this question' : `${missing.name}: required`);
      return;
    }
    this.error.set(null);
    this.sectionStep.update((n) => Math.min(n + 1, this.stepCount() - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Page by question: a single choice moves on by itself after a moment (Back fixes a wrong pick). */
  picked(f: FormFieldDto) {
    if (f.type !== 'SINGLE_SELECT' || this.layout() !== 'questions') return;
    const at = this.sectionStep();
    setTimeout(() => {
      if (this.sectionStep() === at && this.sectionStep() < this.stepCount() - 1) this.next();
    }, 350);
  }

  back() {
    this.error.set(null);
    this.sectionStep.update((n) => Math.max(0, n - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  round(n: number) {
    return Math.round(n);
  }

  bandAssetHref(b: { assetUrl: string | null }) {
    return resolveAssetUrl(b.assetUrl);
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
    if (this.paged() && this.sectionStep() < this.stepCount() - 1) {
      this.next();
      return;
    }
    await this.run(async () => {
      await this.saver.flush();
      const r = await this.call<FormPublicSubmitResultDto>('POST', '/submit', {
        ...(this.draftToken ? { draftToken: this.draftToken } : {}),
        values: this.values,
        submitter: { name: this.name.trim(), email: this.email.trim(), phone: this.phone.trim(), organization: this.organization.trim() },
        website: this.website,
      });
      this.doneMessage.set(r.message);
      if (this.isIntake()) {
        this.draftToken = null;
        try {
          localStorage.removeItem(this.draftKey);
        } catch {
          // Nothing to clean up.
        }
      }
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
    if (this.isIntake()) {
      try {
        this.draftToken = localStorage.getItem(this.draftKey);
      } catch {
        this.draftToken = null;
      }
    }
    const f = await this.call<FormPublicFormDto>('GET', this.draftToken ? `/form?draft=${encodeURIComponent(this.draftToken)}` : '/form');
    this.form.set(f);
    this.values = { ...f.values };
    if (f.submitter) {
      this.name = f.submitter.name ?? '';
      this.email = f.submitter.email ?? '';
      this.phone = f.submitter.phone ?? '';
      this.organization = f.submitter.organization ?? '';
    } else if (this.draftToken && !Object.keys(f.values).length) {
      // The draft is gone (sent, or removed by the organization): start fresh.
      this.draftToken = null;
    }
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

  /** File questions: upload one file through this link (with the link's access token). */
  readonly uploadFile = async (file: File): Promise<FormFileRef> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    if (this.accessToken) headers['X-Form-Access'] = this.accessToken;
    const res = await fetch(`${this.base}/files`, { method: 'POST', headers, body: form });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = Array.isArray(json?.message) ? json.message.join(', ') : json?.message;
      throw new Error(msg || 'Upload failed');
    }
    return json as FormFileRef;
  };

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
