import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

/** A change the guide proposed. Nothing runs until the person confirms it on this card. */
export interface HelpAgentAction {
  tool: string;
  title: string;
  /** Confirm button label, e.g. "Create". */
  confirm: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'done' | 'cancelled' | 'failed';
  error?: string;
}

type FieldKind = 'text' | 'list' | 'bool' | 'items';
interface Field {
  key: string;
  label: string;
  kind: FieldKind;
  /** Display text (view mode, and read-only items). */
  display: string;
}

const LABELS: Record<string, string> = {
  linkedin_url: 'LinkedIn URL',
  due_on: 'Due date',
  occurred_at: 'When',
  is_active: 'Active',
  is_completed: 'Done',
  invoice_code: 'Invoice code',
  parent_task: 'Parent task',
  to_project: 'To project',
  to_section: 'To section',
};
/** Raw upload fields: shown as one "Photo" line, never edited. */
const HIDDEN = new Set(['avatar_base64', 'avatar_mime_type']);

function labelFor(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/_/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function itemSummary(item: unknown): string {
  if (!item || typeof item !== 'object') return String(item ?? '');
  return Object.entries(item as Record<string, unknown>)
    .filter(([k, v]) => !HIDDEN.has(k) && v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${labelFor(k)}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
    .join('; ');
}

/**
 * Confirmation card for one guide change (Create / Edit / Cancel). Flat text, list and yes/no fields can
 * be edited; lists of items (bulk creates) are shown read-only, so ask the guide to change those.
 */
@Component({
  selector: 'app-help-agent-action-card',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule, TagModule, ToggleSwitchModule],
  template: `
    <div class="help-agent-action">
      <div class="help-agent-action-head">
        <span class="help-agent-action-title"><i class="pi pi-pencil" aria-hidden="true"></i> {{ action().title }}</span>
        @switch (action().status) {
          @case ('done') { <p-tag value="Done" severity="success" /> }
          @case ('cancelled') { <p-tag value="Cancelled" severity="secondary" /> }
        }
      </div>

      @if (editing()) {
        @for (f of fields(); track f.key) {
          <div class="form-field">
            <label [for]="'ha-' + f.key">{{ f.label }}</label>
            @switch (f.kind) {
              @case ('bool') {
                <p-toggleswitch [inputId]="'ha-' + f.key" [(ngModel)]="draft[f.key]" />
              }
              @case ('items') {
                <p [id]="'ha-' + f.key" class="help-agent-action-items">{{ f.display }}</p>
              }
              @default {
                <input pInputText class="w-full" [id]="'ha-' + f.key" [(ngModel)]="draft[f.key]" />
              }
            }
          </div>
        }
      } @else {
        <dl class="help-agent-action-fields">
          @for (f of fields(); track f.key) {
            <dt class="text-color-secondary">{{ f.label }}</dt>
            <dd>{{ f.display }}</dd>
          }
        </dl>
      }

      @if (action().status === 'failed' && action().error) {
        <p-message severity="error" size="small" [text]="action().error!" />
      }

      @if (action().status === 'pending' || action().status === 'running' || action().status === 'failed') {
        <div class="help-agent-action-buttons">
          <p-button
            size="small"
            [label]="action().confirm"
            icon="pi pi-check"
            [loading]="action().status === 'running'"
            (onClick)="onConfirm()"
          />
          @if (!editing()) {
            <p-button
              size="small"
              label="Edit"
              icon="pi pi-pencil"
              severity="secondary"
              [disabled]="action().status === 'running'"
              (onClick)="startEdit()"
            />
          }
          <p-button
            size="small"
            label="Cancel"
            severity="secondary"
            [text]="true"
            [disabled]="action().status === 'running'"
            (onClick)="cancelled.emit()"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      /* Hand-styled: no existing control is a small proposal card inside a chat bubble. Neutral border, no accent stripe. */
      .help-agent-action {
        margin-top: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: 8px;
        background: var(--p-content-background, transparent);
      }
      .help-agent-action-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
        margin-bottom: 0.5rem;
      }
      .help-agent-action-title {
        display: inline-flex;
        align-items: center;
        gap: 0.375rem;
        font-weight: 600;
      }
      .help-agent-action-fields {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.25rem 0.75rem;
        margin: 0 0 0.75rem;
      }
      .help-agent-action-fields dd {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .help-agent-action-items {
        margin: 0;
        white-space: pre-line;
      }
      .help-agent-action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin-top: 0.5rem;
      }
    `,
  ],
})
export class HelpAgentActionCardComponent {
  readonly action = input.required<HelpAgentAction>();
  /** Confirm with the (possibly edited) arguments. */
  readonly confirmed = output<Record<string, unknown>>();
  readonly cancelled = output<void>();

  readonly editing = signal(false);
  /** Edit-mode values: text for text/list fields, boolean for yes/no. */
  draft: Record<string, unknown> = {};

  readonly fields = computed<Field[]>(() => {
    const args = this.action().args;
    const out: Field[] = [];
    for (const [key, value] of Object.entries(args)) {
      if (HIDDEN.has(key) || value === undefined || value === null || value === '') continue;
      if (key === 'avatar_url') {
        out.push({ key, label: 'Photo', kind: 'text', display: String(value) });
        continue;
      }
      if (typeof value === 'boolean') {
        out.push({ key, label: labelFor(key), kind: 'bool', display: value ? 'Yes' : 'No' });
      } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        out.push({ key, label: labelFor(key), kind: 'list', display: value.join(', ') });
      } else if (Array.isArray(value)) {
        out.push({ key, label: labelFor(key), kind: 'items', display: value.map((v, i) => `${i + 1}. ${itemSummary(v)}`).join('\n') });
      } else if (typeof value === 'object') {
        out.push({ key, label: labelFor(key), kind: 'items', display: itemSummary(value) });
      } else {
        out.push({ key, label: labelFor(key), kind: 'text', display: String(value) });
      }
    }
    if (args['avatar_base64']) out.push({ key: 'avatar_base64', label: 'Photo', kind: 'items', display: 'Attached' });
    return out;
  });

  startEdit() {
    const args = this.action().args;
    this.draft = {};
    for (const f of this.fields()) {
      if (f.kind === 'bool') this.draft[f.key] = args[f.key] === true;
      else if (f.kind === 'text' || f.kind === 'list') this.draft[f.key] = f.display;
    }
    this.editing.set(true);
  }

  onConfirm() {
    if (!this.editing()) {
      this.confirmed.emit(this.action().args);
      return;
    }
    // Rebuild arguments from the draft; untouched and read-only fields keep their original values.
    const args: Record<string, unknown> = { ...this.action().args };
    for (const f of this.fields()) {
      if (!(f.key in this.draft)) continue;
      const v = this.draft[f.key];
      if (f.kind === 'bool') args[f.key] = v === true;
      else if (f.kind === 'list') {
        args[f.key] = String(v ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        const text = String(v ?? '').trim();
        const original = this.action().args[f.key];
        if (!text) delete args[f.key];
        else args[f.key] = typeof original === 'number' && !Number.isNaN(Number(text)) ? Number(text) : text;
      }
    }
    this.editing.set(false);
    this.confirmed.emit(args);
  }
}
