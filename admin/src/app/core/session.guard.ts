import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { SessionService } from './session.service';

/** Ensures the user exists in the database before app routes load. */
export const sessionGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const auth = inject(AuthStoreService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me) return true;

  sessionStorage.setItem(
    'ubo_auth_error',
    'Could not verify your account. Contact your administrator or run npm run dev:seed for local dev.',
  );
  auth.clear();
  session.reset();
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
