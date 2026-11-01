import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { FormFieldDto } from '@upstart/back-office/shared';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { DateInputComponent } from '../date-input/date-input.component';

/**
 * The one control for a form field (label + input by type). Used on the record page in the
 * back office and on the public form page. `value` is the stored shape: string, number, YYYY-MM-DD,
 * option id, option ids, or true.
 */
@Component({
  selector: 'app-form-field-input',
  standalone: true,
  host: { class: 'form-field' },
  imports: [FormsModule, CheckboxModule, InputNumberModule, InputTextModule, MultiSelectModule, SelectModule, TextareaModule, DateInputComponent],
  template: `
    @let f = field();
    @let id = 'ff-' + f.id;
    @if (f.type === 'CONTENT') {
      <!-- A text block: formatted text, no input. -->
      <div class="ff-text" [innerHTML]="f.name"></div>
    } @else if (choices() && (f.type === 'SINGLE_SELECT' || f.type === 'MULTI_SELECT')) {
      <!-- Choices as a list to click (public pages), instead of a dropdown. -->
      <span class="ff-legend" [id]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="ff-required">*</span>}</span>
      <div class="ff-choices" [attr.role]="f.type === 'SINGLE_SELECT' ? 'radiogroup' : 'group'" [attr.aria-labelledby]="id">
        @for (o of f.options; track o.id) {
          @let on = isPicked(o.id);
          <button
            type="button"
            class="ff-choice"
            [class.ff-choice--on]="on"
            [attr.role]="f.type === 'SINGLE_SELECT' ? 'radio' : 'checkbox'"
            [attr.aria-checked]="on"
            [disabled]="disabled()"
            (click)="pick(o.id)"
          >
            <i class="pi" [class.pi-circle]="!on && f.type === 'SINGLE_SELECT'" [class.pi-circle-fill]="on && f.type === 'SINGLE_SELECT'" [class.pi-stop]="!on && f.type === 'MULTI_SELECT'" [class.pi-check-square]="on && f.type === 'MULTI_SELECT'" aria-hidden="true"></i>
            <span>{{ o.label }}</span>
          </button>
        }
      </div>
    } @else if (f.type === 'CHECKBOX') {
      <div class="ff-checkbox">
        <p-checkbox [inputId]="id" [binary]="true" [ngModel]="value() === true" (ngModelChange)="value.set($event ? true : null)" [disabled]="disabled()" />
        <label [for]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="ff-required">*</span>}</label>
      </div>
    } @else {
      <label [for]="id">{{ f.name }}@if (showRequired() && f.required) {<span class="ff-required">*</span>}</label>
      @switch (f.type) {
        @case ('LONG_TEXT') {
          <textarea pTextarea [id]="id" class="w-full" rows="3" [autoResize]="true" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event)" [disabled]="disabled()"></textarea>
        }
        @case ('NUMBER') {
          <p-inputNumber
            [inputId]="id"
            [ngModel]="value() ?? null"
            (ngModelChange)="value.set($event)"
            [useGrouping]="false"
            [maxFractionDigits]="4"
            styleClass="w-full"
            inputStyleClass="w-full"
            [disabled]="disabled()"
          />
        }
        @case ('DATE') {
          <app-date-input [inputId]="id" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event || null)" [disabled]="disabled()" />
        }
        @case ('SINGLE_SELECT') {
          <p-select
            [inputId]="id"
            [options]="f.options"
            optionLabel="label"
            optionValue="id"
            [ngModel]="value() ?? null"
            (ngModelChange)="value.set($event)"
            [showClear]="true"
            placeholder="Select…"
            styleClass="w-full"
            appendTo="body"
            [disabled]="disabled()"
          />
        }
        @case ('MULTI_SELECT') {
          <p-multiselect
            [inputId]="id"
            [options]="f.options"
            optionLabel="label"
            optionValue="id"
            [ngModel]="value() ?? []"
            (ngModelChange)="value.set($event)"
            display="chip"
            placeholder="Select…"
            styleClass="w-full"
            appendTo="body"
            [disabled]="disabled()"
          />
        }
        @default {
          <input pInputText [id]="id" class="w-full" [ngModel]="value() ?? ''" (ngModelChange)="value.set($event)" [disabled]="disabled()" />
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ff-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.5rem;
    }
    .ff-checkbox label {
      margin-bottom: 0;
    }
    .ff-text {
      line-height: 1.55;
    }
    .ff-text ::ng-deep p {
      margin: 0 0 0.6rem;
    }
    .ff-text ::ng-deep p:last-child {
      margin-bottom: 0;
    }
    .ff-text ::ng-deep ul,
    .ff-text ::ng-deep ol {
      margin: 0 0 0.6rem;
      padding-left: 1.25rem;
    }
    .ff-legend {
      display: block;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    .ff-choices {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .ff-choice {
      display: flex;
      align-items: flex-start;
      gap: 0.6rem;
      width: 100%;
      padding: 0.7rem 0.85rem;
      border: 1px solid var(--surface-border);
      border-radius: 8px;
      background: var(--surface-card);
      color: inherit;
      font: inherit;
      text-align: left;
      line-height: 1.35;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
    }
    .ff-choice:hover:not(:disabled) {
      border-color: var(--text-color-secondary);
    }
    .ff-choice .pi {
      margin-top: 0.15rem;
      color: var(--text-color-secondary);
    }
    .ff-choice--on {
      border-color: var(--text-color);
      background: var(--surface-ground);
    }
    .ff-choice--on .pi {
      color: var(--text-color);
    }
    .ff-required {
      color: var(--p-red-500, #dc2626);
      margin-left: 0.15rem;
    }
  `,
})
export class FormFieldInputComponent {
  field = input.required<FormFieldDto>();
  value = model<unknown>(null);
  disabled = input(false);
  /** Mark required fields with * (public page; staff can save with them empty). */
  showRequired = input(false);
  /** Show single and multi selects as a list of choices to click (public pages) instead of a dropdown. */
  choices = input(false);

  protected isPicked(id: string): boolean {
    const v = this.value();
    return Array.isArray(v) ? v.includes(id) : v === id;
  }

  protected pick(id: string) {
    if (this.field().type === 'MULTI_SELECT') {
      const cur = Array.isArray(this.value()) ? (this.value() as string[]) : [];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      this.value.set(next.length ? next : null);
    } else {
      this.value.set(id);
    }
  }
}
