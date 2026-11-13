import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ApiService } from '../../core/api.service';
import { CommunicationsApi } from '../../core/communications.api';
import { HelpTextComponent } from '../help-text/help-text.component';

type ActivitySettings = { goneQuietDays: number };

/** Settings → Activity: when a client counts as gone quiet. */
@Component({
  selector: 'app-activity-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputNumberModule, HelpTextComponent],
  template: `
    <div class="showcase-row">
      <div class="form-field showcase-half">
        <label for="goneQuietDays">Gone quiet after (days) <app-help-text key="settings.activity.goneQuietDays" /></label>
        <p-inputNumber inputId="goneQuietDays" [(ngModel)]="goneQuietDays" [min]="7" [max]="365" [showButtons]="true" styleClass="w-full" inputStyleClass="w-full" />
      </div>
    </div>
    <div class="form-actions">
      <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
    </div>
  `,
})
export class ActivitySettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly comms = inject(CommunicationsApi);
  private readonly toast = inject(MessageService);

  goneQuietDays = 30;
  saving = signal(false);

  async ngOnInit() {
    try {
      const s = await this.api.get<ActivitySettings>('/organization-profile/activity');
      this.goneQuietDays = s.goneQuietDays;
    } catch {
      // Defaults stay.
    }
  }

  async save() {
    this.saving.set(true);
    try {
      const s = await this.api.put<ActivitySettings>('/organization-profile/activity', {
        goneQuietDays: this.goneQuietDays,
      });
      this.goneQuietDays = s.goneQuietDays;
      this.comms.notifyActivityChanged();
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Activity settings updated.', life: 3000 });
    } catch (err) {
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }
}
