import { Component, effect, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AppDialogModule } from '../../core/app-dialog.module';
import { OrganizationSelectComponent } from '../organization-select/organization-select.component';

export type AcceptResponseChoice = { mode: 'new' | 'existing'; name?: string; clientId?: string };

/**
 * The one "accept into an organization" dialog for form responses (Care intakes, Forms submissions):
 * a new Prospect organization (name) or an existing organization. The caller does the API call.
 */
@Component({
  selector: 'app-accept-response-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectButtonModule, AppDialogModule, OrganizationSelectComponent],
  template: `
    <p-dialog [header]="header()" [(visible)]="visible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      <div class="form-field">
        <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [(ngModel)]="mode" [allowEmpty]="false" />
      </div>
      @if (mode === 'new') {
        <div class="form-field mt-3">
          <label for="arName">Organization name</label>
          <input pInputText id="arName" class="w-full" [(ngModel)]="name" />
        </div>
      } @else {
        <div class="form-field mt-3">
          <label for="arOrg">Organization</label>
          <app-organization-select inputId="arOrg" [(value)]="clientId" />
        </div>
      }
      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="busy()" (onClick)="visible.set(false)" />
        <p-button
          label="Accept"
          icon="pi pi-check"
          [loading]="busy()"
          [disabled]="mode === 'new' ? !name.trim() : !clientId"
          (onClick)="submit()"
        />
      </ng-template>
    </p-dialog>
  `,
})
export class AcceptResponseDialogComponent {
  readonly modes = [
    { value: 'new', label: 'New organization' },
    { value: 'existing', label: 'Existing organization' },
  ];

  visible = model(false);
  header = input('Accept');
  /** Prefills the new organization's name each time the dialog opens. */
  defaultName = input('');
  busy = input(false);
  accept = output<AcceptResponseChoice>();

  mode: 'new' | 'existing' = 'new';
  name = '';
  clientId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      this.mode = 'new';
      this.name = this.defaultName();
      this.clientId = null;
    });
  }

  submit() {
    this.accept.emit(this.mode === 'new' ? { mode: 'new', name: this.name.trim() } : { mode: 'existing', clientId: this.clientId ?? undefined });
  }
}
