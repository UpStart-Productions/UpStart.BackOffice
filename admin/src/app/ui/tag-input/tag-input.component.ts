import { Component, computed, inject, input, model, OnInit, viewChild } from '@angular/core';
import { CrmTagsApi } from '../../core/crm-tags.api';
import {
  FindOrCreatePickerComponent,
  type FindOrCreateOption,
  type FindOrCreatePick,
} from '../find-or-create-picker/find-or-create-picker.component';

/**
 * Tag field: chips in the control; click opens `app-find-or-create-picker` (same as Task Manager tags).
 */
@Component({
  selector: 'app-tag-input, app-crm-tag-input',
  standalone: true,
  imports: [FindOrCreatePickerComponent],
  host: { class: 'ubo-tag-input-host' },
  template: `
    <div
      class="ubo-tag-field"
      [class.ubo-tag-field--disabled]="disabled()"
      [attr.tabindex]="disabled() ? -1 : 0"
      role="combobox"
      aria-haspopup="dialog"
      [attr.aria-label]="placeholder()"
      (click)="onFieldClick($event)"
      (keydown.enter)="onFieldClick($event)"
    >
      @for (tag of tags(); track tag) {
        <span class="ubo-tag-pill">
          <span class="ubo-tag-pill-label">{{ tag }}</span>
          @if (!disabled()) {
            <button
              type="button"
              class="ubo-tag-pill-remove"
              (click)="remove(tag, $event)"
              [attr.aria-label]="'Remove tag ' + tag"
            >
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          }
        </span>
      }
      @if (!disabled()) {
        <span class="ubo-tag-add-hint" [class.ubo-tag-add-hint--solo]="!tags().length">
          {{ tags().length ? 'Add…' : placeholder() }}
        </span>
      }
    </div>

    <app-find-or-create-picker
      #picker
      [options]="pickerOptions()"
      [placeholder]="pickerPlaceholder()"
      [createKind]="createKind()"
      [emptyHint]="pickerEmptyHint()"
      (picked)="onPickerPick($event)"
    />
  `,
  styles: `
    .ubo-tag-field {
      cursor: text;
    }
    .ubo-tag-field--disabled {
      cursor: default;
    }
    .ubo-tag-add-hint {
      flex: 1 1 4rem;
      min-width: 3rem;
      padding: 0.125rem 0.25rem;
      font-size: var(--fs-base);
      line-height: 1.4;
      color: var(--text-color-secondary);
      user-select: none;
    }
    .ubo-tag-add-hint--solo {
      color: var(--text-color-secondary);
    }
  `,
})
export class TagInputComponent implements OnInit {
  private readonly crmTags = inject(CrmTagsApi, { optional: true });

  readonly tags = model<string[]>([]);
  readonly presets = input<string[] | undefined>(undefined);
  readonly suggestionNames = input<string[] | undefined>(undefined);
  readonly placeholder = input('Add a tag…');
  readonly createKind = input('value');
  readonly inputId = input<string | undefined>(undefined);
  readonly disabled = input(false);

  private readonly picker = viewChild.required(FindOrCreatePickerComponent);

  protected readonly pickerOptions = computed((): FindOrCreateOption[] =>
    this.catalog().map((name) => ({ id: name.toLowerCase(), name })),
  );

  protected readonly hiddenPickerIds = computed(() => this.tags().map((t) => t.toLowerCase()));

  protected readonly pickerPlaceholder = computed(() => {
    const kind = this.createKind();
    return kind === 'tag' ? 'Find or create a tag' : `Find or create a ${kind}`;
  });

  protected readonly pickerEmptyHint = computed(() => {
    const kind = this.createKind();
    return kind === 'value' ? 'Type to add a value' : `Type to create a ${kind}`;
  });

  ngOnInit(): void {
    void this.crmTags?.load();
  }

  protected onFieldClick(event: Event) {
    if (this.disabled()) return;
    const t = event.target as HTMLElement;
    if (t.closest('.ubo-tag-pill-remove')) return;
    const target = (event.currentTarget ?? event.target) as HTMLElement;
    this.picker().open(event, this.hiddenPickerIds(), target);
  }

  protected onPickerPick(pick: FindOrCreatePick) {
    const name =
      'name' in pick
        ? pick.name
        : (this.pickerOptions().find((o) => o.id === pick.id)?.name ?? pick.id);
    this.addTag(name);
  }

  protected remove(tag: string, event: MouseEvent) {
    event.stopPropagation();
    this.tags.set(this.tags().filter((t) => t !== tag));
  }

  /** @deprecated No inline query; kept for save hooks that flush pending text. */
  commitPendingQuery(): string[] {
    return this.tags();
  }

  private addTag(raw: string) {
    const name = this.canonical(raw);
    if (!name) return;
    if (this.tags().some((t) => t.toLowerCase() === name.toLowerCase())) return;
    this.tags.set([...this.tags(), name]);
  }

  private canonical(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const key = trimmed.toLowerCase();
    return this.catalog().find((n) => n.toLowerCase() === key) ?? trimmed;
  }

  private catalog(): string[] {
    const fromPresets = this.presets();
    if (fromPresets !== undefined) return fromPresets;
    const custom = this.suggestionNames();
    if (custom !== undefined) return custom;
    return this.crmTags?.names() ?? [];
  }
}

/** @deprecated Import TagInputComponent; kept for existing imports. */
export { TagInputComponent as CrmTagInputComponent };
