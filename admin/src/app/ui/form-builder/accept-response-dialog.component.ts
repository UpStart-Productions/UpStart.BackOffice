import { Component, computed, effect, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectButtonModule } from 'primeng/selectbutton';
import type { FormSubmissionMatchDto } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { OrganizationSelectComponent } from '../organization-select/organization-select.component';

export type AcceptResponseChoice = { mode: 'new' | 'existing'; name?: string; clientId?: string };

/**
 * The one "accept" dialog for form submissions: a new organization (a Prospect) or, for client forms that create
 * clients, a new client; or an existing one. Possible matches (same email or name) show as quick picks.
 * The caller does the API call.
 */
@Component({
  selector: 'app-accept-response-dialog',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectButtonModule, AppDialogModule, OrganizationSelectComponent],
  template: `
    <p-dialog [header]="header()" [(visible)]="visible" [modal]="true" [style]="{ width: 'min(30rem, 96vw)' }">
      @if (matches().length) {
        <div class="form-field">
          <label>Possible matches</label>
          <div class="side-list">
            @for (m of matches(); track m.clientId) {
              <div class="side-list-row">
                <div class="side-list-body">
                  <span class="side-list-title">{{ m.name }}</span>
                  <span class="side-list-detail">{{ m.reason }}</span>
                </div>
                <p-button label="Use" size="small" severity="secondary" [outlined]="true" (onClick)="pick(m)" />
              </div>
            }
          </div>
        </div>
      }
      <div class="form-field" [class.mt-3]="matches().length">
        <p-selectbutton [options]="modes()" optionLabel="label" optionValue="value" [(ngModel)]="mode" [allowEmpty]="false" />
      </div>
      @if (mode === 'new') {
        <div class="form-field mt-3">
          <label for="arName">{{ createsClients() ? 'Client name' : 'Organization name' }}</label>
          <input pInputText id="arName" class="w-full" [(ngModel)]="name" />
        </div>
      } @else {
        <div class="form-field mt-3">
          <label for="arOrg">{{ createsClients() ? 'Client' : 'Organization' }}</label>
          <app-organization-select inputId="arOrg" [(value)]="clientId" [clientsOnly]="createsClients()" />
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
  visible = model(false);
  header = input('Accept');
  /** Prefills the new organization's (or client's) name each time the dialog opens. */
  defaultName = input('');
  busy = input(false);
  /** Client form that creates clients: "New client" / "Existing client" instead of organizations. */
  createsClients = input(false);
  /** Clients that may be who sent it. */
  matches = input<FormSubmissionMatchDto[]>([]);
  accept = output<AcceptResponseChoice>();

  readonly modes = computed(() =>
    this.createsClients()
      ? [
          { value: 'new', label: 'New client' },
          { value: 'existing', label: 'Existing client' },
        ]
      : [
          { value: 'new', label: 'New organization' },
          { value: 'existing', label: 'Existing organization' },
        ],
  );

  mode: 'new' | 'existing' = 'new';
  name = '';
  clientId: string | null = null;

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      this.mode = this.matches().length ? 'existing' : 'new';
      this.name = this.defaultName();
      this.clientId = null;
    });
  }

  pick(m: FormSubmissionMatchDto) {
    this.accept.emit({ mode: 'existing', clientId: m.clientId });
  }

  submit() {
    this.accept.emit(this.mode === 'new' ? { mode: 'new', name: this.name.trim() } : { mode: 'existing', clientId: this.clientId ?? undefined });
  }
}
