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
        path: 'time-entry',
        loadComponent: () =>
          import('./pages/time-entry/time-entry-list.page').then((m) => m.TimeEntryListPage),
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
      { path: '', redirectTo: 'time-entry', pathMatch: 'full' },
    ],
  },
  { path: '**', redirectTo: 'time-entry', pathMatch: 'full' },
];
