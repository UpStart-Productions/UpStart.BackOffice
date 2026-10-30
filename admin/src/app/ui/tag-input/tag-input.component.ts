import { CdkOverlayOrigin, OverlayModule } from '@angular/cdk/overlay';
import { Component, inject, input, model, OnInit, signal, viewChild } from '@angular/core';
import { CrmTagsApi } from '../../core/crm-tags.api';

/** Drop below the field; flip above when there is not enough room. */
const PANEL_POSITIONS = [
  {
    originX: 'start' as const,
    originY: 'bottom' as const,
    overlayX: 'start' as const,
    overlayY: 'top' as const,
    offsetY: 4,
  },
  {
    originX: 'start' as const,
    originY: 'top' as const,
    overlayX: 'start' as const,
    overlayY: 'bottom' as const,
    offsetY: -4,
  },
];

/**
 * Universal tag field: chips inside the control, type to filter suggestions, Enter or click to add.
 */
@Component({
  selector: 'app-tag-input, app-crm-tag-input',
  standalone: true,
  imports: [OverlayModule],
  host: { class: 'ubo-tag-input-host' },
  template: `
    <div
      class="ubo-tag-field"
      cdkOverlayOrigin
      #tagOrigin="cdkOverlayOrigin"
      [class.ubo-tag-field--disabled]="disabled()"
      [class.ubo-tag-field--open]="panelOpen()"
      (click)="focusQuery($event)"
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
        <input
          #queryInput
          type="text"
          class="ubo-tag-query"
          [id]="inputId()"
          [value]="query()"
          [placeholder]="tags().length ? '' : placeholder()"
          autocomplete="off"
          (input)="onQueryInput($event)"
          (keydown)="onQueryKeydown($event)"
          (focus)="openPanel()"
          (blur)="onQueryBlur()"
        />
      }
    </div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="tagOrigin"
      [cdkConnectedOverlayOpen]="panelOpen() && filtered().length > 0"
      [cdkConnectedOverlayPositions]="panelPositions"
      [cdkConnectedOverlayWidth]="panelWidth()"
      [cdkConnectedOverlayPush]="true"
      cdkConnectedOverlayPanelClass="ubo-tag-panel-overlay"
    >
      <ul class="ubo-tag-panel" role="listbox" (mousedown)="$event.preventDefault()">
        @for (name of filtered(); track name; let i = $index) {
          <li
            role="option"
            class="ubo-tag-panel-option"
            [class.ubo-tag-panel-option--active]="i === highlight()"
            (mousedown)="pick(name)"
          >
            {{ name }}
          </li>
        }
      </ul>
    </ng-template>
  `,
})
export class TagInputComponent implements OnInit {
  private readonly crmTags = inject(CrmTagsApi, { optional: true });

  readonly tags = model<string[]>([]);
  readonly suggestionNames = input<string[] | undefined>(undefined);
  readonly placeholder = input('Add a tag…');
  readonly inputId = input<string | undefined>(undefined);
  readonly disabled = input(false);

  private readonly queryInput = viewChild<HTMLInputElement>('queryInput');
  private readonly tagOrigin = viewChild<CdkOverlayOrigin>('tagOrigin');

  protected readonly panelPositions = PANEL_POSITIONS;
  protected readonly query = signal('');
  protected readonly panelOpen = signal(false);
  protected readonly highlight = signal(0);
  protected readonly filtered = signal<string[]>([]);
  protected readonly panelWidth = signal(0);

  ngOnInit(): void {
    void this.crmTags?.load();
  }

  protected focusQuery(event: MouseEvent): void {
    if (this.disabled()) return;
    const t = event.target as HTMLElement;
    if (t.closest('.ubo-tag-pill-remove')) return;
    this.queryInput()?.focus();
  }

  protected onQueryInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.refreshFiltered();
    this.openPanel();
    this.highlight.set(0);
  }

  protected openPanel(): void {
    this.refreshFiltered();
    this.syncPanelWidth();
    this.panelOpen.set(true);
  }

  protected onQueryBlur(): void {
    setTimeout(() => this.panelOpen.set(false), 150);
  }

  protected onQueryKeydown(event: KeyboardEvent): void {
    const list = this.filtered();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (list.length) this.highlight.set(Math.min(this.highlight() + 1, list.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (list.length) this.highlight.set(Math.max(this.highlight() - 1, 0));
      return;
    }
    if (event.key === 'Escape') {
      this.panelOpen.set(false);
      return;
    }
    if (event.key === 'Backspace' && !this.query().trim() && this.tags().length) {
      this.tags.set(this.tags().slice(0, -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = list[this.highlight()] ?? this.query().trim();
      if (pick) this.addTag(pick);
      return;
    }
  }

  protected pick(name: string): void {
    this.addTag(name);
    this.queryInput()?.focus();
  }

  protected remove(tag: string, event: MouseEvent): void {
    event.stopPropagation();
    this.tags.set(this.tags().filter((t) => t !== tag));
    this.refreshFiltered();
  }

  private syncPanelWidth(): void {
    const el = this.tagOrigin()?.elementRef.nativeElement;
    this.panelWidth.set(el ? el.getBoundingClientRect().width : 0);
  }

  private addTag(raw: string): void {
    const name = this.canonical(raw);
    if (!name) return;
    if (this.tags().some((t) => t.toLowerCase() === name.toLowerCase())) {
      this.query.set('');
      this.refreshFiltered();
      return;
    }
    this.tags.set([...this.tags(), name]);
    this.query.set('');
    this.refreshFiltered();
    this.highlight.set(0);
  }

  private refreshFiltered(): void {
    const q = this.query().trim().toLowerCase();
    const taken = new Set(this.tags().map((t) => t.toLowerCase()));
    this.filtered.set(
      this.catalog().filter((n) => !taken.has(n.toLowerCase()) && (!q || n.toLowerCase().includes(q))),
    );
  }

  private canonical(raw: string): string {
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const key = trimmed.toLowerCase();
    return this.catalog().find((n) => n.toLowerCase() === key) ?? trimmed;
  }

  private catalog(): string[] {
    const custom = this.suggestionNames();
    if (custom) return custom;
    return this.crmTags?.names() ?? [];
  }
}

/** @deprecated Import TagInputComponent; kept for existing imports. */
export { TagInputComponent as CrmTagInputComponent };
