import { Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { DateInputComponent } from '../date-input/date-input.component';
import { HelpTextComponent } from '../help-text/help-text.component';
import { ClientFieldSectionWithValues, ClientFieldType } from './client-fields.types';

type Values = Record<string, unknown>;

/**
 * The organization page's custom sections (Settings → Client fields), one card per section.
 * Edits are saved by the page's Save button: the page asks isDirty() and calls save().
 */
@Component({
  selector: 'app-client-fields-panel',
  standalone: true,
  imports: [
    FormsModule,
    CheckboxModule,
    InputNumberModule,
    InputTextModule,
    MultiSelectModule,
    SelectModule,
    TagModule,
    TextareaModule,
    DateInputComponent,
    HelpTextComponent,
  ],
  template: `
    @for (s of sections(); track s.id) {
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">{{ s.name }}</h3>
          @if (s.sensitive) {
            <span class="cf-sensitive">
              <p-tag value="Sensitive" severity="warn" icon="pi pi-lock" />
              <app-help-text key="settings.clientFields.sensitive" />
            </span>
          }
        </div>
        <div class="showcase-row">
          @for (f of s.fields; track f.id) {
            <div class="form-field showcase-half" [class.cf-wide]="f.type === 'LONG_TEXT'">
              @switch (f.type) {
                @case ('CHECKBOX') {
                  <div class="cf-checkbox">
                    <p-checkbox [inputId]="'cf-' + f.id" [binary]="true" [(ngModel)]="values[f.id]" [disabled]="!canEdit()" />
                    <label [for]="'cf-' + f.id">{{ f.name }}</label>
                  </div>
                }
                @default {
                  <label [for]="'cf-' + f.id">{{ f.name }}</label>
                  @switch (f.type) {
                    @case ('TEXT') {
                      <input pInputText [id]="'cf-' + f.id" class="w-full" [(ngModel)]="values[f.id]" [disabled]="!canEdit()" />
                    }
                    @case ('LONG_TEXT') {
                      <textarea pTextarea [id]="'cf-' + f.id" class="w-full" rows="3" [autoResize]="true" [(ngModel)]="values[f.id]" [disabled]="!canEdit()"></textarea>
                    }
                    @case ('NUMBER') {
                      <p-inputNumber [inputId]="'cf-' + f.id" [(ngModel)]="values[f.id]" [useGrouping]="false" [maxFractionDigits]="4" styleClass="w-full" inputStyleClass="w-full" [disabled]="!canEdit()" />
                    }
                    @case ('DATE') {
                      <app-date-input [inputId]="'cf-' + f.id" [(ngModel)]="values[f.id]" [disabled]="!canEdit()" />
                    }
                    @case ('SINGLE_SELECT') {
                      <p-select
                        [inputId]="'cf-' + f.id"
                        [options]="f.options"
                        optionLabel="label"
                        optionValue="id"
                        [(ngModel)]="values[f.id]"
                        [showClear]="true"
                        placeholder="Select…"
                        styleClass="w-full"
                        appendTo="body"
                        [disabled]="!canEdit()"
                      />
                    }
                    @case ('MULTI_SELECT') {
                      <p-multiselect
                        [inputId]="'cf-' + f.id"
                        [options]="f.options"
                        optionLabel="label"
                        optionValue="id"
                        [(ngModel)]="values[f.id]"
                        display="chip"
                        placeholder="Select…"
                        styleClass="w-full"
                        appendTo="body"
                        [disabled]="!canEdit()"
                      />
                    }
                  }
                }
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .cf-wide {
      flex-basis: 100%;
    }
    .cf-sensitive {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
    }
    .cf-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-height: 2.5rem;
    }
  `,
})
export class ClientFieldsPanelComponent {
  private readonly api = inject(ApiService);

  clientId = input.required<string>();
  canEdit = input(false);

  sections = signal<ClientFieldSectionWithValues[]>([]);
  values: Values = {};
  private saved = '';
  private types: Record<string, ClientFieldType> = {};

  constructor() {
    effect(() => {
      void this.load(this.clientId());
    });
  }

  private async load(clientId: string) {
    try {
      this.apply(await this.api.get<ClientFieldSectionWithValues[]>(`/clients/${clientId}/fields`));
    } catch {
      // The rest of the page still works without its custom sections.
      this.apply([]);
    }
  }

  private apply(sections: ClientFieldSectionWithValues[]) {
    const values: Values = {};
    const types: Record<string, ClientFieldType> = {};
    for (const s of sections) {
      for (const f of s.fields) {
        types[f.id] = f.type;
        values[f.id] = f.value ?? (f.type === 'CHECKBOX' ? false : f.type === 'MULTI_SELECT' ? [] : null);
      }
    }
    this.types = types;
    this.values = values;
    this.saved = this.snapshot();
    this.sections.set(sections);
  }

  private normalized(): Values {
    const out: Values = {};
    for (const [id, v] of Object.entries(this.values)) {
      const empty = v === null || v === undefined || v === '' || v === false || (Array.isArray(v) && !v.length);
      out[id] = empty ? null : v;
    }
    return out;
  }

  private snapshot() {
    return JSON.stringify(this.normalized());
  }

  isDirty(): boolean {
    return this.sections().length > 0 && this.snapshot() !== this.saved;
  }

  /** Save changed values. Throws with the API's message so the page can show it. */
  async save(): Promise<void> {
    if (!this.isDirty()) return;
    const before = JSON.parse(this.saved) as Values;
    const now = this.normalized();
    const changed: Values = {};
    for (const id of Object.keys(now)) {
      if (JSON.stringify(now[id]) !== JSON.stringify(before[id] ?? null)) changed[id] = now[id];
    }
    this.apply(await this.api.put<ClientFieldSectionWithValues[]>(`/clients/${this.clientId()}/fields`, { values: changed }));
  }
}
