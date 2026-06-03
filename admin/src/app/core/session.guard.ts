import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';
import { SessionService } from './session.service';

const SESSION_VERIFY_ERROR = environment.useCognito
  ? 'Could not verify your account. Contact your administrator.'
  : 'Could not verify your account. Contact your administrator or run npm run dev:seed for local dev.';

/** Ensures the user exists in the database before app routes load. */
export const sessionGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const auth = inject(AuthStoreService);
  const cognito = inject(CognitoAuthService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me) return true;

  sessionStorage.setItem('ubo_auth_error', SESSION_VERIFY_ERROR);
  auth.clear();
  session.reset();
  if (cognito.useCognito) await cognito.clearLocalSession();
  router.navigate(['/login']);
  return false;
};

export const superGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me?.isSuper) return true;

  router.navigate(['/time-entry']);
  return false;
};
