import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
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
})
export class SettingsPage implements OnInit {
  private readonly api          = inject(ApiService);
  private readonly toast        = inject(MessageService);
  private readonly deleteConfirm = inject(ConfirmDeleteService);

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

  onDialogHide() {
    this.newKey.set(null);
    this.keyName = '';
  }

  confirmRevoke(key: ServiceKey) {
    this.deleteConfirm.confirm({
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

  getRowActions(key: ServiceKey): RowActionItem[] {
    if (!key.isActive) return [];
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
