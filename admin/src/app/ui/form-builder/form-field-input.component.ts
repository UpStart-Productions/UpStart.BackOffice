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
 * The one control for a Care form field (label + input by type). Used on the record page in the
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
    @if (f.type === 'CHECKBOX') {
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
}
