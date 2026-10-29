import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { CareApi, CareFormListItem } from '../../core/care.api';
import { PageComponent } from '../../ui/layout/page.component';
import { RowActionItem, RowActionsMenuComponent } from '../../ui/row-actions-menu/row-actions-menu.component';

/** Care → Forms: the Intake form and Care profile. Setup only. */
@Component({
  selector: 'app-care-forms-page',
  standalone: true,
  imports: [RouterLink, MessageModule, TableModule, PageComponent, RowActionsMenuComponent],
  template: `
    <app-page title="Forms" helpKey="care.forms.page">
      @if (error()) {
        <div class="card"><p-message severity="error" [text]="error()!" /></div>
      }
      <div class="card">
        <p-table [value]="forms()" [loading]="loading()" styleClass="table-bordered">
          <ng-template pTemplate="header">
            <tr>
              <th style="width: 3rem"></th>
              <th>Form</th>
              <th>Fields</th>
              <th>Filled in for</th>
              <th>Who can use it</th>
            </tr>
          </ng-template>
          <ng-template pTemplate="body" let-f>
            <tr>
              <td><app-row-actions-menu [items]="rowActions(f)" ariaLabel="Form actions" /></td>
              <td><a [routerLink]="['/care/forms', f.id]" class="text-primary">{{ f.name }}</a></td>
              <td>{{ f.fieldCount }}</td>
              <td>{{ f.recordCount }} {{ f.recordCount === 1 ? 'record' : 'records' }}</td>
              <td>{{ accessSummary(f) }}</td>
            </tr>
          </ng-template>
        </p-table>
      </div>
    </app-page>
  `,
})
export class CareFormsPage implements OnInit {
  private readonly care = inject(CareApi);
  private readonly router = inject(Router);

  forms = signal<CareFormListItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.forms.set((await this.care.forms()).forms);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load forms');
    } finally {
      this.loading.set(false);
    }
  }

  accessSummary(f: CareFormListItem) {
    const n = Object.keys(f.access).length;
    return n ? `Admins and ${n} ${n === 1 ? 'role' : 'roles'}` : 'Admins only';
  }

  rowActions(f: CareFormListItem): RowActionItem[] {
    return [{ id: 'edit', label: 'Edit', icon: 'pi pi-pencil', command: () => void this.router.navigate(['/care/forms', f.id]) }];
  }
}
