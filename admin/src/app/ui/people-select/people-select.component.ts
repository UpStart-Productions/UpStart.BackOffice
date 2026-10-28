import { Component, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import {
  PeopleDirectoryOption,
  toDirectoryAvatarPerson,
} from '../../pages/projects/people-directory.util';
import { TmAvatarComponent } from '../../task-manager/ui/tm-avatar.component';

/** Searchable people dropdown (avatar, Last First, email) — use everywhere we pick a tenant person. */
@Component({
  selector: 'app-people-select',
  standalone: true,
  imports: [FormsModule, SelectModule, TmAvatarComponent],
  styles: `
    .people-select-option {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      min-width: 0;
      padding: 0.15rem 0;
    }
    .people-select-option-text {
      display: flex;
      flex-direction: column;
      gap: 0.05rem;
      min-width: 0;
    }
    .people-select-option-name {
      font-weight: 600;
      line-height: 1.25;
    }
    .people-select-option-email {
      font-size: var(--fs-sm);
      color: var(--text-color-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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
      [filter]="true"
      filterBy="label,firstName,lastName,email,displayName,sourceLabel"
      [filterPlaceholder]="filterPlaceholder()"
      [showClear]="true"
      [loading]="loading()"
      [placeholder]="placeholder()"
      [styleClass]="styleClass()"
      [fluid]="true"
      panelStyleClass="people-select-panel"
      appendTo="body"
      [attr.aria-label]="ariaLabel()"
    >
      <ng-template #item let-option>
        <div class="people-select-option">
          <app-tm-avatar [person]="avatarPerson(option)" [size]="32" [showTitle]="false" />
          <span class="people-select-option-text">
            <span class="people-select-option-name">{{ option.label }}</span>
            <span class="people-select-option-email">{{ option.email || 'No email on file' }}</span>
          </span>
        </div>
      </ng-template>
      <ng-template #selectedItem let-option>
        @if (option) {
          <div class="people-select-selected">
            <app-tm-avatar [person]="avatarPerson(option)" [size]="24" [showTitle]="false" />
            <span class="people-select-selected-label">{{ option.label }}</span>
          </div>
        }
      </ng-template>
    </p-select>
  `,
})
export class PeopleSelectComponent {
  readonly pickId = model<string | null>(null);

  options = input.required<PeopleDirectoryOption[]>();
  loading = input(false);
  inputId = input('');
  placeholder = input('Search and select…');
  filterPlaceholder = input('Search people…');
  styleClass = input('w-full');
  ariaLabel = input('Search and select a person');

  readonly avatarPerson = toDirectoryAvatarPerson;
}
