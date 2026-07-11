import { Route } from '@angular/router';
import { authGuard, loginGuard } from './core/auth.guard';
import { sessionGuard, adminGuard } from './core/session.guard';
import { ShellComponent } from './layout/shell.component';

export const appRoutes: Route[] = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
    canActivate: [loginGuard],
  },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard, sessionGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'time-entry',
        loadComponent: () =>
          import('./pages/time-entry/time-entry-list.page').then((m) => m.TimeEntryListPage),
      },
      {
        path: 'expenses',
        loadComponent: () =>
          import('./pages/expenses/expenses-list.page').then((m) => m.ExpensesListPage),
      },
      {
        path: 'invoices',
        loadComponent: () =>
          import('./pages/invoices/invoices-list.page').then((m) => m.InvoicesListPage),
      },
      {
        path: 'invoices/new',
        loadComponent: () =>
          import('./pages/invoices/invoice-form.page').then((m) => m.InvoiceFormPage),
      },
      {
        path: 'invoices/:id/edit',
        loadComponent: () =>
          import('./pages/invoices/invoice-form.page').then((m) => m.InvoiceFormPage),
      },
      {
        path: 'invoices/:id',
        loadComponent: () =>
          import('./pages/invoices/invoice-detail.page').then((m) => m.InvoiceDetailPage),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./pages/reports/reports.page').then((m) => m.ReportsPage),
      },
      {
        path: 'accounting/accounts',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/accounting/chart-of-accounts.page').then((m) => m.ChartOfAccountsPage),
      },
      {
        path: 'accounting/journal',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/accounting/journal-list.page').then((m) => m.JournalListPage),
      },
      {
        path: 'accounting/journal/new',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/accounting/journal-entry-form.page').then((m) => m.JournalEntryFormPage),
      },
      {
        path: 'accounting/bank-import',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/accounting/bank-import.page').then((m) => m.BankImportPage),
      },
      {
        path: 'accounting/reports',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/accounting/accounting-reports.page').then((m) => m.AccountingReportsPage),
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./pages/clients/clients-list.page').then((m) => m.ClientsListPage),
      },
      {
        path: 'clients/new',
        loadComponent: () =>
          import('./pages/clients/client-form.page').then((m) => m.ClientFormPage),
      },
      {
        path: 'clients/:id',
        loadComponent: () =>
          import('./pages/clients/client-form.page').then((m) => m.ClientFormPage),
      },
      {
        path: 'network',
        loadComponent: () =>
          import('./pages/network/companies-list.page').then((m) => m.NetworkCompaniesListPage),
      },
      {
        path: 'network/new',
        loadComponent: () =>
          import('./pages/network/company-form.page').then((m) => m.NetworkCompanyFormPage),
      },
      {
        path: 'network/:id',
        loadComponent: () =>
          import('./pages/network/company-form.page').then((m) => m.NetworkCompanyFormPage),
      },
      {
        path: 'projects',
        loadComponent: () =>
          import('./pages/projects/projects-list.page').then((m) => m.ProjectsListPage),
      },
      {
        path: 'projects/new',
        loadComponent: () =>
          import('./pages/projects/project-form.page').then((m) => m.ProjectFormPage),
      },
      {
        path: 'projects/:id',
        loadComponent: () =>
          import('./pages/projects/project-form.page').then((m) => m.ProjectFormPage),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./pages/users/users-list.page').then((m) => m.UsersListPage),
        canActivate: [adminGuard],
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./pages/settings/settings.page').then((m) => m.SettingsPage),
        canActivate: [adminGuard],
      },
      {
        path: 'pipeline',
        loadComponent: () =>
          import('./pages/pipeline/pipeline-board.page').then((m) => m.PipelineBoardPage),
      },
      {
        path: 'pipeline/new',
        loadComponent: () =>
          import('./pages/pipeline/lead-detail.page').then((m) => m.LeadDetailPage),
      },
      {
        path: 'pipeline/:id',
        loadComponent: () =>
          import('./pages/pipeline/lead-detail.page').then((m) => m.LeadDetailPage),
      },
      {
        path: 'bookings',
        loadComponent: () =>
          import('./pages/bookings/bookings.page').then((m) => m.BookingsPage),
      },
      {
        path: 'bookings/types',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/bookings/bookings.page').then((m) => m.BookingsPage),
      },
      {
        path: 'bookings/types/new',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/booking-types/booking-type-form.page').then((m) => m.BookingTypeFormPage),
      },
      {
        path: 'bookings/types/:id',
        canActivate: [adminGuard],
        loadComponent: () =>
          import('./pages/booking-types/booking-type-form.page').then((m) => m.BookingTypeFormPage),
      },
      { path: 'booking-types', redirectTo: 'bookings/types', pathMatch: 'full' },
      { path: 'booking-types/new', redirectTo: 'bookings/types/new', pathMatch: 'full' },
      { path: 'booking-types/:id', redirectTo: 'bookings/types/:id', pathMatch: 'full' },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'dashboard', pathMatch: 'full' },
];
