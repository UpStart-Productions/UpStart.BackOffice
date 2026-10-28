import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../../core/api.service';
import { AppDialogModule } from '../../core/app-dialog.module';
import { TenantService } from '../../core/tenant.service';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';
import { HelpTextComponent } from '../../ui/help-text/help-text.component';

type TenantRow = { id: string; name: string; slug: string; internalDomains: string[]; createdAt: string };

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Platform admin: list and add tenants, and switch into one. Super users only. */
@Component({
  selector: 'app-tenants-page',
  standalone: true,
  imports: [FormsModule, PageComponent, TableModule, ButtonModule, InputTextModule, MessageModule, TagModule, AppDialogModule, RowActionsMenuComponent, HelpTextComponent],
  template: `
    <app-page title="Tenants" helpKey="tenant.overview">
      <p-button pageActions label="Add tenant" icon="pi pi-plus" (onClick)="openAdd()" />
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <p-table [value]="tenants()" [loading]="loading()" styleClass="table-bordered">
          <ng-template pTemplate="header">
            <tr><th style="width: 3rem"></th><th>Name</th><th>Slug</th><th>Internal domains</th></tr>
          </ng-template>
          <ng-template pTemplate="body" let-t>
            <tr>
              <td><app-row-actions-menu [items]="getRowActions(t)" ariaLabel="Tenant actions" /></td>
              <td>
                {{ t.name }}
                @if (t.slug === tenant.currentSlug()) { <p-tag value="Current" severity="info" styleClass="ml-2" /> }
              </td>
              <td><code>{{ t.slug }}</code></td>
              <td>{{ t.internalDomains.length ? t.internalDomains.join(', ') : '—' }}</td>
            </tr>
          </ng-template>
        </p-table>
      </div>

      <p-dialog
        [header]="editingId ? 'Edit tenant' : 'Add tenant'"
        [(visible)]="addVisible"
        [modal]="true"
        [draggable]="false"
        [resizable]="false"
        [closable]="!saving()"
        [style]="{ width: 'min(30rem, 96vw)' }"
      >
        <div class="form">
          <label for="t-name">Name</label>
          <input pInputText id="t-name" [ngModel]="name" (ngModelChange)="onName($event)" placeholder="The Purple Nest" class="w-full" />
          <label for="t-slug">Slug <app-help-text key="tenant.slug" /></label>
          <input pInputText id="t-slug" [(ngModel)]="slug" (ngModelChange)="slugEdited = true" placeholder="purplenest" class="w-full" />
          <label for="t-domains">Internal email domains (optional) <app-help-text key="tenant.internalDomains" /></label>
          <input pInputText id="t-domains" [(ngModel)]="domains" placeholder="thepurplenest.org, example.com" class="w-full" />
          @if (formError()) { <p-message severity="error" [text]="formError()!" /> }
        </div>
        <ng-template pTemplate="footer">
          <p-button label="Cancel" severity="secondary" [text]="true" [disabled]="saving()" (onClick)="addVisible = false" />
          <p-button [label]="editingId ? 'Save' : 'Add'" icon="pi pi-check" [loading]="saving()" [disabled]="!name.trim() || !slug.trim()" (onClick)="save()" />
        </ng-template>
      </p-dialog>
    </app-page>
  `,
  styles: `.form { display: flex; flex-direction: column; gap: 0.5rem; }`,
})
export class TenantsPage implements OnInit {
  private readonly api = inject(ApiService);
  readonly tenant = inject(TenantService);

  tenants = signal<TenantRow[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  saving = signal(false);
  formError = signal<string | null>(null);
  addVisible = false;
  name = '';
  slug = '';
  domains = '';
  slugEdited = false;
  editingId: string | null = null;

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.tenants.set(await this.api.get<TenantRow[]>('/tenants'));
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Failed to load tenants');
    } finally {
      this.loading.set(false);
    }
  }

  getRowActions(t: TenantRow): RowActionItem[] {
    const actions: RowActionItem[] = [{ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => this.openEdit(t) }];
    if (t.slug !== this.tenant.currentSlug()) {
      actions.push({ id: 'switch', label: 'Switch to', icon: 'pi pi-arrow-right-arrow-left', command: () => this.tenant.switchTo(t.slug) });
    }
    return actions;
  }

  openEdit(t: TenantRow) {
    this.editingId = t.id;
    this.name = t.name;
    this.slug = t.slug;
    this.domains = t.internalDomains.join(', ');
    this.slugEdited = true;
    this.formError.set(null);
    this.addVisible = true;
  }

  openAdd() {
    this.editingId = null;
    this.name = this.slug = this.domains = '';
    this.slugEdited = false;
    this.formError.set(null);
    this.addVisible = true;
  }

  onName(v: string) {
    this.name = v;
    if (!this.slugEdited) this.slug = slugify(v);
  }

  async save() {
    this.saving.set(true);
    this.formError.set(null);
    try {
      const internalDomains = this.domains.split(',').map((d) => d.trim()).filter(Boolean);
      const body = { name: this.name.trim(), slug: this.slug.trim(), internalDomains };
      if (this.editingId) {
        const old = this.tenants().find((t) => t.id === this.editingId);
        await this.api.patch(`/tenants/${this.editingId}`, body);
        // Keep the active tenant selection valid when its slug was changed.
        if (old && old.slug === this.tenant.currentSlug() && old.slug !== body.slug) {
          this.tenant.switchTo(body.slug);
          return;
        }
      } else {
        await this.api.post('/tenants', body);
      }
      this.addVisible = false;
      await Promise.all([this.load(), this.tenant.load()]);
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message.replace(/^API error \d+: /, '') : 'Could not save tenant');
    } finally {
      this.saving.set(false);
    }
  }
}
