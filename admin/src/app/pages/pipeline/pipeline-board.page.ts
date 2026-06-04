import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { ApiService } from '../../core/api.service';
import { PageComponent } from '../../ui/layout/page.component';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { RowActionsMenuComponent, RowActionItem } from '../../ui/row-actions-menu/row-actions-menu.component';

export type Lead = {
  id: string;
  organization: string;
  primaryContact?: string;
  contactRole?: string;
  email?: string;
  stage: string;
  source?: string;
  category?: string;
  nextAction?: string;
  nextActionDate?: string;
  serviceInterests: string[];
};

export const STAGES: { key: string; label: string; color: string }[] = [
  { key: 'NEW_LEAD',      label: '🌱 New Lead',      color: 'success' },
  { key: 'DISCOVERY',     label: '🔍 Discovery',     color: 'info' },
  { key: 'PROPOSAL_SENT', label: '📄 Proposal Sent', color: 'warn' },
  { key: 'ON_HOLD',       label: '❄️ On Hold',       color: 'secondary' },
  { key: 'ACTIVE_CLIENT', label: '🤝 Active Client', color: 'success' },
  { key: 'PAST_CLIENT',   label: '✅ Past Client',   color: 'secondary' },
];

@Component({
  selector: 'app-pipeline-board-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, TagModule, MessageModule, PageComponent, RowActionsMenuComponent],
  templateUrl: './pipeline-board.page.html',
})
export class PipelineBoardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

  leads = signal<Lead[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  readonly stages = STAGES;

  leadsForStage = (stageKey: string) =>
    this.leads().filter(l => l.stage === stageKey);

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.get<Lead[]>('/leads');
      this.leads.set(data);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load pipeline');
    } finally { this.loading.set(false); }
  }

  openLead(id: string) {
    this.router.navigate(['/pipeline', id]);
  }

  getRowActions(lead: Lead): RowActionItem[] {
    const actions: RowActionItem[] = [
      {
        id: 'edit',
        label: 'Open',
        icon: 'pi pi-arrow-right',
        command: () => this.router.navigate(['/pipeline', lead.id]),
      },
    ];

    if (lead.stage !== 'ACTIVE_CLIENT' && lead.stage !== 'PAST_CLIENT') {
      actions.push({
        id: 'convert',
        label: 'Convert to Client',
        icon: 'pi pi-user-plus',
        command: () => this.router.navigate(['/pipeline', lead.id], { queryParams: { convert: '1' } }),
      });
    }

    actions.push({
      id: 'delete',
      label: 'Delete',
      icon: 'pi pi-trash',
      severity: 'danger',
      command: () => this.confirmDelete(lead),
    });

    return actions;
  }

  confirmDelete(lead: Lead) {
    this.deleteConfirm.confirm({
      message: `Delete "${lead.organization}"? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/leads/${lead.id}`);
          await this.load();
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Delete failed');
        }
      },
    });
  }
}
