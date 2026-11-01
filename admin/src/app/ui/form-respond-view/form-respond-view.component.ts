import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AccordionModule } from 'primeng/accordion';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TabsModule } from 'primeng/tabs';
import {
  isContentField,
  type FormFieldDto,
  type FormLayout,
  type FormSectionDto,
} from '@upstart/back-office/shared';
import { FormFieldInputComponent } from '../form-builder/form-field-input.component';

type RespondPage = { section: FormSectionDto | null; fields: FormFieldDto[]; question: boolean; intro?: string | null };

/**
 * Renders a form the way people see it on a public link (layouts, About you, paging).
 * Used for staff preview; public pages can use the same shell later.
 */
@Component({
  selector: 'app-form-respond-view',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    FormsModule,
    AccordionModule,
    ButtonModule,
    InputTextModule,
    MessageModule,
    TabsModule,
    FormFieldInputComponent,
  ],
  styleUrls: ['../../pages/task-form/task-form.page.scss'],
  template: `
    <h2 class="page-title task-form-title">
      {{ formName() }}@if (clientName()) {: {{ clientName() }}}
    </h2>
    @if (descriptionHtml()) {
      <div class="text-color-secondary task-form-intro cp-rich" [innerHTML]="descriptionHtml()"></div>
    } @else if (description()) {
      <p class="text-color-secondary task-form-intro">{{ description() }}</p>
    } @else {
      <div class="mb-3"></div>
    }
    <form class="login-form" (ngSubmit)="onSubmit()">
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
                <app-form-field-input
                  class="mb-3"
                  [field]="f"
                  [value]="values[f.id] ?? null"
                  (valueChange)="values[f.id] = $event; picked(f)"
                  [showRequired]="true"
                  [choices]="true"
                />
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
            @for (sec of sections(); track sec.id) {
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
              @for (sec of sections(); track sec.id) {
                <p-tab [value]="sec.id">{{ sec.name }}</p-tab>
              }
            </p-tablist>
            <p-tabpanels>
              @for (sec of sections(); track sec.id) {
                <p-tabpanel [value]="sec.id">
                  <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec, hideTitle: true }" />
                </p-tabpanel>
              }
            </p-tabpanels>
          </p-tabs>
        }
        @default {
          @for (sec of sections(); track sec.id) {
            <ng-container *ngTemplateOutlet="sectionTpl; context: { $implicit: sec }" />
          }
        }
      }

      <ng-template #whoTpl>
        <div class="flex flex-wrap gap-2 mb-3">
          <div class="form-field flex-1">
            <label [for]="id('name')">Your name@if (intake()) {<span class="task-form-required">*</span>}</label>
            <input pInputText [id]="id('name')" name="name" class="w-full" [(ngModel)]="name" autocomplete="name" />
          </div>
          @if (intake()) {
            <div class="form-field flex-1">
              <label [for]="id('email')">Your email<span class="task-form-required">*</span></label>
              <input
                pInputText
                [id]="id('email')"
                name="email"
                type="email"
                class="w-full"
                [(ngModel)]="email"
                [readonly]="!!verifiedEmail()"
                autocomplete="email"
              />
            </div>
            @if (ask().organization) {
              <div class="form-field flex-1">
                <label [for]="id('org')">Organization<span class="task-form-required">*</span></label>
                <input pInputText [id]="id('org')" name="organization" class="w-full" [(ngModel)]="organization" autocomplete="organization" />
              </div>
            }
            @if (ask().phone) {
              <div class="form-field flex-1">
                <label [for]="id('phone')">Phone</label>
                <input pInputText [id]="id('phone')" name="phone" class="w-full" [(ngModel)]="phone" autocomplete="tel" />
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
          <app-form-field-input
            class="mb-3"
            [field]="f"
            [value]="values[f.id] ?? null"
            (valueChange)="values[f.id] = $event"
            [showRequired]="true"
            [choices]="true"
          />
        }
      </ng-template>

      <div class="task-form-hp" aria-hidden="true">
        <label [for]="id('website')">Website</label>
        <input [id]="id('website')" name="website" tabindex="-1" autocomplete="off" [(ngModel)]="website" />
      </div>
      @if (error()) {
        <p-message severity="error" styleClass="w-full mb-3" [text]="error()!" />
      }
      @if (previewNotice()) {
        <p-message severity="info" styleClass="w-full mb-3" [text]="previewNotice()!" />
      }
      <div class="login-actions">
        @if (paged() && sectionStep() > 0) {
          <p-button label="Back" severity="secondary" [outlined]="true" (onClick)="back()" />
        }
        @if (paged() && sectionStep() < stepCount() - 1) {
          <p-button label="Next" (onClick)="next()" />
        } @else {
          <p-button type="submit" [label]="preview() ? 'Send (preview)' : 'Send'" />
        }
      </div>
    </form>
  `,
  styles: `
    .cp-step {
      color: var(--text-color-secondary);
      margin: 0 0 0.25rem;
    }
    .cp-intro {
      margin: -0.25rem 0 1rem;
    }
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
  `,
})
export class FormRespondViewComponent {
  readonly formName = input.required<string>();
  readonly description = input<string | null>(null);
  readonly descriptionHtml = input<string | null>(null);
  readonly clientName = input<string | null>(null);
  readonly layout = input.required<FormLayout>();
  readonly sections = input.required<FormSectionDto[]>();
  readonly ask = input({ organization: false, phone: false });
  /** New-response style: name, email and optional org/phone. */
  readonly intake = input(true);
  readonly preview = input(false);
  readonly verifiedEmail = input<string | null>(null);
  readonly idPrefix = input('frv');

  name = '';
  email = '';
  phone = '';
  organization = '';
  website = '';
  values: Record<string, unknown> = {};

  readonly error = signal<string | null>(null);
  readonly previewNotice = signal<string | null>(null);
  readonly sectionStep = signal(0);
  openSection: string | number | undefined = undefined;

  readonly paged = computed(() => this.layout() === 'steps' || this.layout() === 'questions');

  readonly pages = computed<RespondPage[]>(() => {
    const sections = this.sections();
    const layout = this.layout();
    const out: RespondPage[] = [];
    for (const s of sections) {
      if (layout === 'questions') {
        if (s.description) out.push({ section: s, fields: [], question: false, intro: s.description });
        for (const fld of s.fields) out.push({ section: s, fields: [fld], question: !isContentField(fld) });
      } else {
        out.push({ section: s, fields: s.fields, question: false });
      }
    }
    if (this.intake()) out.push({ section: null, fields: [], question: false });
    return out;
  });

  readonly stepCount = computed(() => this.pages().length);
  readonly page = computed(() => this.pages()[this.sectionStep()] ?? null);
  readonly questionCount = computed(() => this.pages().filter((p) => p.question).length);
  readonly questionNumber = computed(() => this.pages().slice(0, this.sectionStep()).filter((p) => p.question).length + 1);
  readonly progress = computed(() => {
    const total = this.questionCount();
    return total ? Math.round(((this.questionNumber() - 1) / total) * 100) : 0;
  });

  constructor() {
    effect(() => {
      this.sections();
      this.layout();
      this.sectionStep.set(0);
      this.openSection = this.sections()[0]?.id;
      this.error.set(null);
      this.previewNotice.set(null);
      const verified = this.verifiedEmail();
      if (verified) this.email = verified;
    });
  }

  id(part: string) {
    return `${this.idPrefix()}-${part}`;
  }

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

  onSubmit() {
    if (this.paged() && this.sectionStep() < this.stepCount() - 1) {
      this.next();
      return;
    }
    if (this.preview()) {
      this.previewNotice.set('Preview only — answers were not saved.');
      this.error.set(null);
      return;
    }
  }
}

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}
