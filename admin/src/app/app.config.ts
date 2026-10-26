import { defer } from 'rxjs';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  Injector,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideQuillConfig } from 'ngx-quill/config';
import { QuillService } from 'ngx-quill';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { appRoutes } from './app.routes';
import { AppUpdateService } from './core/app-update.service';
import { AuthStoreService } from './core/auth-store.service';
import { CognitoAuthService } from './core/cognito-auth.service';
import { QuillBootstrapService } from './core/quill-bootstrap.service';
import { rememberQuillIconInjector } from './core/quill-icon-injector';
import { QuillFileUploadService } from './core/quill-file-upload.service';
import { quillFileUploadInitializer } from './core/quill-file-upload.initializer';
import { QuillImageUploadService } from './core/quill-image-upload.service';
import { quillImageUploadInitializer } from './core/quill-image-upload.initializer';

const UpStartPreset = definePreset(Aura, {
  components: {
    datepicker: {
      date: { width: '1.625rem', height: '1.625rem', padding: '0' },
      weekDay: { padding: '0.125rem 0' },
      dayView: { margin: '0.25rem 0 0 0' },
      header: { padding: '0 0 0.35rem 0' },
      panel: { padding: '0.4rem 0.5rem' },
    },
  },
  semantic: {
    iconSize: '1rem',
    formField: {
      sm: { fontSize: '0.75rem' },
      lg: { fontSize: '0.875rem' },
    },
    navigation: {
      submenuIcon: { size: '0.75rem' },
    },
    primary: {
      50: '#faf5ff',
      100: '#f5f2ff',
      200: '#e9d5ff',
      300: '#c4b5fd',
      400: '#a855f7',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
    /* heyupstart.com blue — info buttons, secondary emphasis */
    blue: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#c7d2fe',
      300: '#93c5fd',
      400: '#667eea',
      500: '#3b82f6',
      600: '#2563eb',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    green: {
      50: '#ecfdf5',
      100: '#d1fae5',
      200: '#a7f3d0',
      300: '#6ee7b7',
      400: '#34d399',
      500: '#10b981',
      600: '#00a544',
      700: '#047857',
      800: '#19352c',
      900: '#14532d',
      950: '#052e16',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (updates: AppUpdateService) => () => {
        updates.install();
      },
      deps: [AppUpdateService],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (cognito: CognitoAuthService, auth: AuthStoreService) => async () => {
        await cognito.init();
        if (cognito.useCognito && cognito.hasCachedToken()) {
          const email = await cognito.getEmailFromSession();
          if (email) auth.baseEmail = email;
        }
      },
      deps: [CognitoAuthService, AuthStoreService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (injector: Injector) => () => rememberQuillIconInjector(injector),
      deps: [Injector],
    },
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: (quillBootstrap: QuillBootstrapService) => () => {
        quillBootstrap.installLazyHook();
      },
      deps: [QuillBootstrapService],
    },
    {
      provide: APP_INITIALIZER,
      useFactory: quillImageUploadInitializer,
      deps: [QuillImageUploadService, QuillService],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: quillFileUploadInitializer,
      deps: [QuillFileUploadService, QuillService],
      multi: true,
    },
    provideQuillConfig({
      theme: 'snow',
      // @mentions (Task Manager). Observables are awaited before any editor renders, keeping Quill lazy.
      customModules: [
        { path: 'blots/mention', implementation: defer(() => import('quill-mention').then((m) => m.MentionBlot)) },
        { path: 'modules/mention', implementation: defer(() => import('quill-mention').then((m) => m.Mention)) },
        // Lucide "insert icon" embed + toolbar button (ported from GrovLink).
        { path: 'formats/lucideIcon', implementation: defer(() => import('./core/quill-lucide-icons').then((m) => m.loadLucideIconBlot())) },
        { path: 'formats/personCard', implementation: defer(() => import('./core/quill-person-card').then((m) => m.loadPersonCardBlot())) },
      ],
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'image', 'contentFile', 'lucideIcon', 'personCard'],
        ],
      },
    }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(),
    provideAnimationsAsync(),
    ConfirmationService,
    MessageService,
    providePrimeNG({
      theme: { preset: UpStartPreset, options: { darkModeSelector: '.app-dark' } },
    }),
  ],
};
