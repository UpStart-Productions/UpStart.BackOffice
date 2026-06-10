import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ApiService } from '../../core/api.service';
import { ConfirmDeleteService } from '../../core/confirm-delete.service';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionsMenuComponent, RowActionItem } from '../../ui/row-actions-menu/row-actions-menu.component';

interface ServiceKey {
  id:         string;
  name:       string;
  keyPrefix:  string;
  isActive:   boolean;
  lastUsedAt: string | null;
  createdAt:  string;
}

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    FormsModule,
    PageComponent,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MessageModule,
    TagModule,
    TooltipModule,
    RowActionsMenuComponent,
  ],
  templateUrl: './settings.page.html',
  styles: [
    `
      .api-key-row {
        display: flex;
        align-items: stretch;
        gap: 0.5rem;
      }

      .api-key-value {
        flex: 1 1 auto;
        min-width: 0;
        display: block;
        padding: 0.625rem 0.75rem;
        border: 1px solid var(--color-border);
        border-radius: var(--content-border-radius);
        background: var(--color-background);
        font-size: 0.875rem;
        word-break: break-all;
      }

      .api-key-row .p-button {
        flex-shrink: 0;
      }
    `,
  ],
})
export class SettingsPage implements OnInit {
  private readonly api          = inject(ApiService);
  private readonly toast        = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);
  private readonly confirmation = inject(ConfirmationService);

  keys      = signal<ServiceKey[]>([]);
  loading   = signal(true);
  error     = signal<string | null>(null);
  generating = signal(false);

  showGenerateDialog = false;
  keyName   = '';
  newKey    = signal<string | null>(null);
  newKeyName = signal('');

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const keys = await this.api.get<ServiceKey[]>('/service-keys');
      this.keys.set(keys);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load keys');
    } finally {
      this.loading.set(false);
    }
  }

  openGenerate() {
    this.keyName = '';
    this.newKey.set(null);
    this.newKeyName.set('');
    this.showGenerateDialog = true;
  }

  async generate() {
    const name = this.keyName.trim();
    if (!name) return;
    this.generating.set(true);
    try {
      const result = await this.api.post<{ id: string; name: string; key: string }>('/service-keys', { name });
      this.newKey.set(result.key);
      this.newKeyName.set(result.name);
      await this.load();
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to generate key');
      this.showGenerateDialog = false;
    } finally {
      this.generating.set(false);
    }
  }

  copyKey() {
    const key = this.newKey();
    if (!key) return;
    void navigator.clipboard.writeText(key);
    this.toast.add({ severity: 'success', summary: 'Copied', detail: 'Key copied to clipboard', life: 2000 });
  }

  closeGenerateDialog() {
    this.showGenerateDialog = false;
  }

  onDialogHide() {
    this.newKey.set(null);
    this.keyName = '';
  }

  confirmRevoke(key: ServiceKey) {
    this.deleteConfirm.confirm({
      header: 'Confirm revoke',
      message: `Revoke "${key.name}"? Any service using this key will immediately lose access.`,
      accept: async () => {
        try {
          await this.api.delete(`/service-keys/${key.id}`);
          await this.load();
          this.toast.add({ severity: 'info', summary: 'Revoked', detail: `"${key.name}" has been revoked`, life: 4000 });
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to revoke key');
        }
      },
    });
  }

  confirmDelete(key: ServiceKey) {
    this.deleteConfirm.confirm({
      message: `Delete "${key.name}" permanently? This cannot be undone.`,
      accept: async () => {
        try {
          await this.api.delete(`/service-keys/${key.id}/permanent`);
          await this.load();
          this.toast.add({ severity: 'success', summary: 'Deleted', detail: `"${key.name}" has been removed`, life: 4000 });
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to delete key');
        }
      },
    });
  }

  confirmReinstate(key: ServiceKey) {
    this.confirmation.confirm({
      header: 'Confirm reinstate',
      message: `Reinstate "${key.name}"? Services using this key will regain access.`,
      icon: 'pi pi-exclamation-triangle',
      rejectButtonStyleClass: 'p-button-secondary',
      accept: async () => {
        try {
          await this.api.patch(`/service-keys/${key.id}/reinstate`);
          await this.load();
          this.toast.add({ severity: 'success', summary: 'Reinstated', detail: `"${key.name}" is active again`, life: 4000 });
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to reinstate key');
        }
      },
    });
  }

  getRowActions(key: ServiceKey): RowActionItem[] {
    if (!key.isActive) {
      return [
        {
          id: 'reinstate',
          label: 'Reinstate',
          icon: 'pi pi-check-circle',
          command: () => this.confirmReinstate(key),
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: 'pi pi-trash',
          severity: 'danger',
          command: () => this.confirmDelete(key),
        },
      ];
    }
    return [
      {
        id: 'revoke',
        label: 'Revoke',
        icon: 'pi pi-ban',
        severity: 'danger',
        command: () => this.confirmRevoke(key),
      },
    ];
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
