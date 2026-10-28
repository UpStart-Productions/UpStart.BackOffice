import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ApiService } from '../../core/api.service';
import { HelpTextComponent } from '../help-text/help-text.component';
import { MoneyInputComponent } from '../money-input/money-input.component';
import { ExpenseCategoriesSettingsComponent } from '../expense-categories/expense-categories-settings.component';

interface OrganizationProfile {
  companyName: string;
  logoUrl: string | null;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  billingEmail?: string;
  mileageRate?: number | null;
}

@Component({
  selector: 'app-expenses-invoicing-settings',
  standalone: true,
  imports: [FormsModule, ButtonModule, HelpTextComponent, MoneyInputComponent, ExpenseCategoriesSettingsComponent],
  template: `
    <div class="form-field mb-4">
      <label for="expensesMileageRate">Mileage rate (per mile) <app-help-text key="settings.expensesInvoicing.mileageRate" /></label>
      <app-money-input
        inputId="expensesMileageRate"
        name="expensesMileageRate"
        [min]="0"
        [max]="100"
        [minFractionDigits]="2"
        [maxFractionDigits]="4"
        [(ngModel)]="mileageRate"
        styleClass="input-quarter"
        inputStyleClass="input-quarter-field"
      />
      <div class="form-actions mt-2">
        <p-button label="Save mileage rate" icon="pi pi-check" [loading]="savingMileage()" (onClick)="saveMileageRate()" />
      </div>
    </div>

    <app-expense-categories-settings />
  `,
})
export class ExpensesInvoicingSettingsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(MessageService);

  mileageRate: number | null = null;
  savingMileage = signal(false);
  private profileSnapshot: OrganizationProfile | null = null;

  async ngOnInit() {
    await this.loadProfile();
  }

  private async loadProfile() {
    try {
      const profile = await this.api.get<OrganizationProfile>('/organization-profile');
      this.profileSnapshot = profile;
      this.mileageRate = profile.mileageRate ?? null;
    } catch {
      this.profileSnapshot = null;
      this.mileageRate = null;
    }
  }

  async saveMileageRate() {
    if (!this.profileSnapshot) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not save',
        detail: 'Business profile is not loaded yet.',
      });
      return;
    }
    this.savingMileage.set(true);
    const p = this.profileSnapshot;
    try {
      await this.api.put<OrganizationProfile>('/organization-profile', {
        companyName: p.companyName?.trim() ?? '',
        address: p.address?.trim() ?? '',
        city: p.city?.trim() ?? '',
        state: (p.state ?? '').trim(),
        zip: p.zip?.trim() ?? '',
        phone: p.phone?.trim() ?? '',
        billingEmail: (p.billingEmail ?? '').trim(),
        mileageRate: this.mileageRate ?? null,
      });
      await this.loadProfile();
      this.toast.add({
        severity: 'success',
        summary: 'Saved',
        detail: 'Mileage rate updated.',
        life: 3000,
      });
    } catch (err) {
      this.toast.add({
        severity: 'error',
        summary: 'Could not save',
        detail: err instanceof Error ? err.message : 'Failed to save mileage rate',
      });
    } finally {
      this.savingMileage.set(false);
    }
  }
}
