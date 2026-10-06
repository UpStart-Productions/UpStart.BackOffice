import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isAdminRole, isGuestRole, isStaffRole } from '@upstart/back-office/shared';
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
  if (me) {
    if (!isStaffRole(me.role) && !isGuestRole(me.role)) {
      router.navigate(['/login']);
      return false;
    }
    return true;
  }

  if (cognito.useCognito) {
    await cognito.refreshSession();
    session.reset();
    me = await session.getReady();
    if (me) {
      if (!isStaffRole(me.role) && !isGuestRole(me.role)) {
        router.navigate(['/login']);
        return false;
      }
      return true;
    }

    const token = await cognito.getIdToken();
    if (token) return true;

    router.navigate(['/login']);
    return false;
  }

  if (auth.baseEmail) return true;

  router.navigate(['/login']);
  return false;
};

export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me && isAdminRole(me.role)) return true;

  router.navigate(['/dashboard']);
  return false;
};

/** Back-office (non Task Manager) pages: staff only. Guests land on My tasks. */
export const staffGuard: CanActivateChildFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  const me = await session.getReady();
  if (!me || isStaffRole(me.role)) return true;
  const path = state.url.split(/[?#]/)[0];
  if (/^\/tasks(\/|$)/.test(path)) return true;
  return router.createUrlTree(['/tasks']);
};

/** @deprecated Use adminGuard */
export const superGuard = adminGuard;
