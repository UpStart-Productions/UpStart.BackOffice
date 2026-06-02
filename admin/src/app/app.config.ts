import {
  APP_INITIALIZER,
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { definePreset } from '@primeuix/themes';
import { appRoutes } from './app.routes';
import { AuthStoreService } from './core/auth-store.service';
import { CognitoAuthService } from './core/cognito-auth.service';

const UpStartPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fdf2f8',
      100: '#fce7f3',
      200: '#fbcfe8',
      300: '#f9a8d4',
      400: '#f472b6',
      500: '#c026a0',
      600: '#a21caf',
      700: '#86198f',
      800: '#701a75',
      900: '#4a044e',
      950: '#2e0231',
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: (cognito: CognitoAuthService, auth: AuthStoreService) => async () => {
        await cognito.init();
        if (cognito.wasOAuthCallback) { auth.workspaceSlug = ''; }
        if (cognito.useCognito && cognito.hasCachedToken()) {
          const email = await cognito.getEmailFromSession();
          if (email) auth.baseEmail = email;
        }
      },
      deps: [CognitoAuthService, AuthStoreService],
      multi: true,
    },
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withEnabledBlockingInitialNavigation()),
    provideHttpClient(),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: { preset: UpStartPreset, options: { darkModeSelector: '.app-dark' } },
    }),
  ],
};
