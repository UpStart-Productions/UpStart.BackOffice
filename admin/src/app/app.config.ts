import {
  APP_INITIALIZER,
  ApplicationConfig,
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
      useFactory: (quillBootstrap: QuillBootstrapService) => () => {
        quillBootstrap.installLazyHook();
      },
      deps: [QuillBootstrapService],
    },
    provideQuillConfig({
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link'],
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
