import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { HELP_AGENT_NAME } from '@upstart/back-office/shared';
import { ApiService } from '../../core/api.service';

type GuideSettings = { readsRecords: boolean; makesChanges: boolean };

/**
 * Settings → Back Office guide: may the guide look up this tenant's records, and propose changes?
 * Changes need lookups (the guide searches before it creates). Saves on toggle.
 */
@Component({
  selector: 'app-guide-settings',
  standalone: true,
  imports: [FormsModule, ToggleSwitchModule],
  template: `
    <div class="form-field">
      <label for="guideReadsRecords">Let {{ agentName }} look up records</label>
      <p-toggleswitch
        inputId="guideReadsRecords"
        [ngModel]="settings().readsRecords"
        (ngModelChange)="save({ readsRecords: $event })"
        [disabled]="saving()"
      />
    </div>
    <p class="text-color-secondary">
      When on, {{ agentName }} can answer questions like "How much have we invoiced this client since January?" or
      "How many open tasks does Sam have?", and only sees what the person asking can see. To answer, the records it
      looks up are sent to Anthropic, the AI provider. Off by default.
    </p>
    <div class="form-field">
      <label for="guideMakesChanges">Let {{ agentName }} make changes (always asks first)</label>
      <p-toggleswitch
        inputId="guideMakesChanges"
        [ngModel]="settings().makesChanges"
        (ngModelChange)="save({ makesChanges: $event })"
        [disabled]="saving() || !settings().readsRecords"
      />
    </div>
    <p class="text-color-secondary">
      When on, {{ agentName }} can propose creating or updating organizations and people, linking them, creating and
      updating tasks, and logging notes and calls. Each change shows a card with the details, and nothing changes until
      the person clicks to confirm. It can't send invoices or change invoices, time, expenses or pipelines. Needs
      record lookups on.
    </p>
  `,
})
export class GuideSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  readonly agentName = HELP_AGENT_NAME;
  readonly settings = signal<GuideSettings>({ readsRecords: false, makesChanges: false });
  readonly saving = signal(false);

  async ngOnInit() {
    try {
      this.settings.set(await this.api.get<GuideSettings>('/organization-profile/guide'));
    } catch {
      // Stays off.
    }
  }

  async save(change: Partial<GuideSettings>) {
    const before = this.settings();
    this.settings.set({ ...before, ...change });
    this.saving.set(true);
    try {
      this.settings.set(await this.api.put<GuideSettings>('/organization-profile/guide', change));
      this.toast.add({ severity: 'success', summary: 'Saved', detail: 'Back Office guide settings updated.', life: 3000 });
    } catch (err) {
      this.settings.set(before);
      this.toast.add({ severity: 'error', summary: 'Could not save', detail: err instanceof Error ? err.message : 'Failed' });
    } finally {
      this.saving.set(false);
    }
  }
}
