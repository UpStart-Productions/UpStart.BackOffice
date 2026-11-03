import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';

export type CreatableSelectOption = { label: string; value: string };

/**
 * Searchable dropdown with presets; the user can type a value that is not in the list.
 */
@Component({
  selector: 'app-creatable-select',
  standalone: true,
  imports: [FormsModule, SelectModule],
  template: `
    <p-select
      [inputId]="inputId()"
      [name]="name()"
      [(ngModel)]="value"
      [options]="options()"
      optionLabel="label"
      optionValue="value"
      [placeholder]="placeholder()"
      [showClear]="showClear()"
      [filter]="true"
      filterBy="label,value"
      filterPlaceholder="Search or type…"
      [editable]="true"
      styleClass="w-full"
      appendTo="body"
      [disabled]="disabled()"
    />
  `,
})
export class CreatableSelectComponent {
  readonly inputId = input<string>();
  readonly name = input<string>();
  readonly placeholder = input('Select or type…');
  readonly showClear = input(true);
  readonly disabled = input(false);
  readonly options = input.required<CreatableSelectOption[]>();
  readonly value = model<string | null>(null);
}
