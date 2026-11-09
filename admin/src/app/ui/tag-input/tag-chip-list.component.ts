import { Component, input, output } from '@angular/core';

/** CRM tag names as `.ubo-tag-pill` chips (table cells, summaries). */
@Component({
  selector: 'app-tag-chip-list',
  standalone: true,
  template: `
    @if (tags().length) {
      <div class="ubo-tag-field ubo-tag-field--cluster">
        @for (tag of tags(); track tag) {
          <span class="ubo-tag-pill">
            <span class="ubo-tag-pill-label">{{ tag }}</span>
            @if (removable()) {
              <button
                type="button"
                class="ubo-tag-pill-remove"
                [attr.aria-label]="'Remove tag ' + tag"
                (click)="onRemove(tag, $event)"
              >
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            }
          </span>
        }
      </div>
    } @else {
      <span class="text-color-secondary">—</span>
    }
  `,
})
export class TagChipListComponent {
  readonly tags = input<string[]>([]);
  /** When true, each chip shows × to drop the tag (list views with edit permission). */
  readonly removable = input(false);
  readonly removeTag = output<string>();

  onRemove(tag: string, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.removeTag.emit(tag);
  }
}
