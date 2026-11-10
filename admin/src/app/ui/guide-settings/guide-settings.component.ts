import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { HELP_AGENT_NAME } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';

type GuideSettings = { readsRecords: boolean };

/** Settings → Back Office guide: may the guide look up this tenant's records? Saves on toggle. */
@Component({
  selector: 'app-guide-settings',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule],
  template: `
    <div class="form-field">
      <label for="guideReadsRecords">Let {{ agentName }} look up records</label>
      <p-toggleswitch
        inputId="guideReadsRecords"
        [ngModel]="readsRecords()"
        (ngModelChange)="save($event)"
        [disabled]="saving()"
      />
    </div>
    <p class="text-color-secondary">
      When on, {{ agentName }} can answer questions like "How much have we invoiced this client since January?" or
      "How many open tasks does Sam have?". It only reads records, never changes them, and only sees what the person
      asking can see. To answer, the records it looks up are sent to Anthropic, the AI provider. Off by default.
    </p>
  `,
})
export class GuideSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  readonly agentName = HELP_AGENT_NAME;
  readonly readsRecords = signal(false);
  readonly saving = signal(false);

  async ngOnInit() {
    try {
      const s = await this.api.get<GuideSettings>('/organization-profile/guide');
      this.readsRecords.set(s.readsRecords);
    } catch {
      // Stays off.
    }
  }

  async save(next: boolean) {
    this.saving.set(true);
    try {
      const s = await this.api.put<GuideSettings>('/organization-profile/guide', { readsRecords: next });
      this.readsRecords.set(s.readsRecords);
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: s.readsRecords ? `${this.agentName} can now look up records.` : `${this.agentName} no longer looks up records.`,
        life: 3000,
      });
    } catch (err) {
      this.readsRecords.set(!next);
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }
}
