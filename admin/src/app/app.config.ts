import { defer } from 'rxjs';
import {
  APP_INITIALIZER,
  ApplicationConfig,
  Injector,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideQuillConfig } from 'ngx-quill/config';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { ConfirmationService, MessageService } from 'primeng/api';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { appRoutes } from './app.routes';
import { AuthStoreService } from './core/auth-store.service';
import { CognitoAuthService } from './core/cognito-auth.service';
import { QuillBootstrapService } from './core/quill-bootstrap.service';
import { rememberQuillIconInjector } from './core/quill-icon-injector';

const UpStartPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
      950: '#2e1065',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
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
    provideQuillConfig({
      theme: 'snow',
      // @mentions (Task Manager). Observables are awaited before any editor renders, keeping Quill lazy.
      customModules: [
        { path: 'blots/mention', implementation: defer(() => import('quill-mention').then((m) => m.MentionBlot)) },
        { path: 'modules/mention', implementation: defer(() => import('quill-mention').then((m) => m.Mention)) },
        // Lucide "insert icon" embed + toolbar button (ported from GrovLink).
        { path: 'formats/lucideIcon', implementation: defer(() => import('./core/quill-lucide-icons').then((m) => m.loadLucideIconBlot())) },
      ],
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'lucideIcon'],
          ['clean'],
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
