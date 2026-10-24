import { Component, inject, input, model, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { CrmTagsApi } from '../../core/crm-tags.api';

/**
 * Tags on an organization or person. Type to pick an existing tag, or press Enter to add a new
 * one. Same idea as GrovLink's tag typeahead; tags are saved by name with the record.
 */
@Component({
  selector: 'app-crm-tag-input',
  standalone: true,
  imports: [FormsModule, AutoCompleteModule],
  styles: [
    `
      .crm-tags {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.5rem;
      }
      .crm-tag {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.2rem 0.35rem 0.2rem 0.65rem;
        border: 1px solid var(--surface-border);
        border-radius: 999px;
        background: var(--surface-ground);
      }
      .crm-tag-remove {
        display: inline-flex;
        border: 0;
        background: none;
        padding: 0.15rem;
        border-radius: 50%;
        cursor: pointer;
        color: var(--color-text-muted);
      }
      .crm-tag-remove:hover,
      .crm-tag-remove:focus-visible {
        background: var(--surface-border);
        color: var(--color-text);
      }
      .crm-tag-input {
        flex: 1 1 12rem;
        min-width: 10rem;
      }
    `,
  ],
  template: `
    <div class="crm-tags">
      @for (tag of tags(); track tag) {
        <span class="crm-tag">
          {{ tag }}
          @if (!disabled()) {
            <button type="button" class="crm-tag-remove" (click)="remove(tag)" [attr.aria-label]="'Remove tag ' + tag">
              <i class="pi pi-times" aria-hidden="true"></i>
            </button>
          }
        </span>
      }
      @if (!disabled()) {
        <div class="crm-tag-input" (keydown.enter)="onEnter($event)">
          <p-autocomplete
            [(ngModel)]="query"
            [suggestions]="suggestions()"
            (completeMethod)="search($event.query)"
            (onSelect)="add($event.value)"
            [forceSelection]="false"
            [completeOnFocus]="true"
            [showEmptyMessage]="false"
            [inputId]="inputId()"
            [placeholder]="placeholder()"
            appendTo="body"
            styleClass="w-full"
            inputStyleClass="w-full"
          />
        </div>
      }
    </div>
  `,
})
export class CrmTagInputComponent implements OnInit {
  private readonly crmTags = inject(CrmTagsApi);

  readonly tags = model<string[]>([]);
  readonly placeholder = input('Add a tag, e.g. Partner');
  readonly inputId = input<string | undefined>(undefined);
  readonly disabled = input(false);

  protected query = '';
  protected readonly suggestions = signal<string[]>([]);

  ngOnInit(): void {
    void this.crmTags.load();
  }

  protected search(q: string): void {
    const query = (q ?? '').trim().toLowerCase();
    const taken = new Set(this.tags().map((t) => t.toLowerCase()));
    this.suggestions.set(
      this.crmTags.names().filter((n) => !taken.has(n.toLowerCase()) && (!query || n.toLowerCase().includes(query))),
    );
  }

  protected onEnter(event: Event): void {
    // Let the autocomplete handle Enter on a highlighted suggestion.
    if (document.querySelector('.p-autocomplete-overlay .p-autocomplete-option.p-focus')) return;
    event.preventDefault();
    this.add(this.query);
  }

  protected add(raw: string): void {
    const name = (raw ?? '').trim().replace(/\s+/g, ' ');
    this.query = '';
    this.suggestions.set([]);
    if (!name) return;
    const existing = this.crmTags.names().find((n) => n.toLowerCase() === name.toLowerCase()) ?? name;
    if (this.tags().some((t) => t.toLowerCase() === existing.toLowerCase())) return;
    this.tags.set([...this.tags(), existing]);
  }

  protected remove(tag: string): void {
    this.tags.set(this.tags().filter((t) => t !== tag));
  }
}
