import { booleanAttribute, Component, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import {
  PeopleDirectoryOption,
  toDirectoryAvatarPerson,
} from '../../pages/projects/people-directory.util';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';
import { PickRowComponent } from '../pick-row/pick-row.component';
import { personPickSubtitle } from '../pick-row/pick-row.util';

/** Searchable people dropdown (avatar, First Last, email underneath) — use everywhere we pick a tenant person. */
@Component({
  selector: 'app-people-select',
  standalone: true,
  imports: [FormsModule, SelectModule, TmAvatarComponent, PickRowComponent],
  styles: `
    .people-select-selected {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
    }
    .people-select-selected-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  template: `
    <p-select
      [inputId]="inputId()"
      [options]="options()"
      optionLabel="label"
      optionValue="id"
      [(ngModel)]="pickId"
      (ngModelChange)="onModelChange($event)"
      [filter]="filterable()"
      filterBy="label,firstName,lastName,email,displayName,sourceLabel"
      [filterPlaceholder]="filterPlaceholder()"
      [showClear]="true"
      [loading]="loading()"
      [disabled]="disabled()"
      [placeholder]="placeholder()"
      [styleClass]="styleClass()"
      [fluid]="true"
      panelStyleClass="people-select-panel"
      appendTo="body"
      [attr.aria-label]="ariaLabel()"
    >
      <ng-template #item let-option>
        <app-pick-row [person]="avatarPerson(option)" [title]="option.label" [subtitle]="subtitle(option)" />
      </ng-template>
      <ng-template #selectedItem let-option>
        @if (option) {
          <div class="people-select-selected">
            <app-tm-avatar [person]="avatarPerson(option)" size="sm" [showTitle]="false" />
            <span class="people-select-selected-label">{{ option.label }}</span>
          </div>
        }
      </ng-template>
    </p-select>
  `,
})
export class PeopleSelectComponent {
  readonly pickId = model<string | null>(null);
  /** Fires with the full row when the user commits a selection (not on clear). */
  readonly picked = output<PeopleDirectoryOption>();

  options = input.required<PeopleDirectoryOption[]>();
  loading = input(false);
  inputId = input('');
  placeholder = input('Search and select…');
  filterPlaceholder = input('Search people…');
  /** When false, the list is not type-to-filter (short lists). Default true. */
  filterable = input(true, { transform: booleanAttribute });
  styleClass = input('w-full');
  disabled = input(false, { transform: booleanAttribute });
  ariaLabel = input('Search and select a person');

  readonly avatarPerson = toDirectoryAvatarPerson;

  subtitle(option: PeopleDirectoryOption): string {
    return personPickSubtitle(option.email);
  }

  onModelChange(value: string | null) {
    this.pickId.set(value);
    if (!value) return;
    const option = this.options().find((o) => o.id === value);
    if (option) this.picked.emit(option);
  }
}
