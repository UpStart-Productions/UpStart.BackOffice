import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';
import { SessionService } from './session.service';

/** Ensures the user exists in the database before app routes load. */
export const sessionGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const auth = inject(AuthStoreService);
  const cognito = inject(CognitoAuthService);
  const router = inject(Router);

  let me = await session.getReady();
  if (me) return true;

  if (cognito.useCognito) {
    await cognito.refreshSession();
    session.reset();
    me = await session.getReady();
    if (me) return true;

    const token = await cognito.getIdToken();
    if (token) return true;

    router.navigate(['/login']);
    return false;
  }

  if (auth.baseEmail) return true;

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
