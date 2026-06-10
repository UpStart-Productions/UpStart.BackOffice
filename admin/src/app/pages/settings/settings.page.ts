import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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

interface AsanaStatus {
  configured: boolean;
  connected: boolean;
  workspaceName?: string | null;
  connectedByEmail?: string | null;
  connectedAt?: string | null;
}

interface AsanaConfig {
  clientId: string;
  redirectUri: string;
  hasClientSecret: boolean;
  suggestedRedirectUri: string;
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
  private readonly route        = inject(ActivatedRoute);
  private readonly router       = inject(Router);

  keys      = signal<ServiceKey[]>([]);
  asana     = signal<AsanaStatus | null>(null);
  loading   = signal(true);
  error     = signal<string | null>(null);
  generating = signal(false);
  asanaConnecting = signal(false);
  asanaDisconnecting = signal(false);
  asanaSavingConfig = signal(false);

  asanaConfigForm = {
    clientId: '',
    clientSecret: '',
    redirectUri: '',
  };
  asanaHasClientSecret = signal(false);
  asanaSuggestedRedirectUri = signal('');

  showGenerateDialog = false;
  keyName   = '';
  newKey    = signal<string | null>(null);
  newKeyName = signal('');

  ngOnInit() {
    void this.load();
    void this.handleAsanaCallback();
  }

  private async handleAsanaCallback() {
    const asana = this.route.snapshot.queryParamMap.get('asana');
    if (!asana) return;
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { asana: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    if (asana === 'connected') {
      this.toast.add({
        severity: 'success',
        summary: 'Asana connected',
        detail: 'Your Asana workspace is linked to Back Office.',
        life: 5000,
      });
      await this.loadAsana();
    } else if (asana === 'error') {
      this.toast.add({
        severity: 'error',
        summary: 'Asana connection failed',
        detail: 'Could not connect Asana. Check your app credentials and try again.',
        life: 6000,
      });
    }
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [keys, asanaStatus, asanaConfig] = await Promise.all([
        this.api.get<ServiceKey[]>('/service-keys'),
        this.api.get<AsanaStatus>('/asana/status').catch(() => null),
        this.api.get<AsanaConfig>('/asana/config').catch(() => null),
      ]);
      this.keys.set(keys);
      this.asana.set(asanaStatus);
      this.applyAsanaConfig(asanaConfig);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      this.loading.set(false);
    }
  }

  private applyAsanaConfig(config: AsanaConfig | null) {
    if (!config) return;
    this.asanaConfigForm = {
      clientId: config.clientId,
      clientSecret: '',
      redirectUri: config.redirectUri,
    };
    this.asanaHasClientSecret.set(config.hasClientSecret);
    this.asanaSuggestedRedirectUri.set(config.suggestedRedirectUri);
  }

  async saveAsanaConfig() {
    const clientId = this.asanaConfigForm.clientId.trim();
    const redirectUri = this.asanaConfigForm.redirectUri.trim();
    const clientSecret = this.asanaConfigForm.clientSecret.trim();

    if (!clientId || !redirectUri) {
      this.error.set('Client ID and redirect URI are required');
      return;
    }
    if (!clientSecret && !this.asanaHasClientSecret()) {
      this.error.set('Client secret is required');
      return;
    }

    this.asanaSavingConfig.set(true);
    this.error.set(null);
    try {
      const config = await this.api.put<AsanaConfig>('/asana/config', {
        clientId,
        redirectUri,
        ...(clientSecret ? { clientSecret } : {}),
      });
      this.applyAsanaConfig(config);
      await this.loadAsana();
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Asana app credentials saved.',
        life: 3000,
      });
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to save Asana config');
    } finally {
      this.asanaSavingConfig.set(false);
    }
  }

  useSuggestedRedirectUri() {
    this.asanaConfigForm.redirectUri = this.asanaSuggestedRedirectUri();
  }

  async loadAsana() {
    try {
      const [asanaStatus, asanaConfig] = await Promise.all([
        this.api.get<AsanaStatus>('/asana/status'),
        this.api.get<AsanaConfig>('/asana/config'),
      ]);
      this.asana.set(asanaStatus);
      this.applyAsanaConfig(asanaConfig);
    } catch {
      this.asana.set(null);
    }
  }

  async connectAsana() {
    this.asanaConnecting.set(true);
    this.error.set(null);
    try {
      const result = await this.api.post<{ url: string }>('/asana/connect');
      window.location.href = result.url;
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to start Asana connection');
      this.asanaConnecting.set(false);
    }
  }

  confirmDisconnectAsana() {
    this.deleteConfirm.confirm({
      header: 'Disconnect Asana',
      message: 'Disconnect Asana from Back Office? Project links will stop syncing until you reconnect.',
      accept: async () => {
        this.asanaDisconnecting.set(true);
        try {
          await this.api.delete('/asana/disconnect');
          await this.loadAsana();
          this.toast.add({
            severity: 'info',
            summary: 'Asana disconnected',
            detail: 'Asana has been disconnected.',
            life: 4000,
          });
        } catch (err) {
          this.error.set(err instanceof Error ? err.message : 'Failed to disconnect Asana');
        } finally {
          this.asanaDisconnecting.set(false);
        }
      },
    });
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
