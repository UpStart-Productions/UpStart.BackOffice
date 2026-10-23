import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { isAdminRole, isGuestRole, isStaffRole, type PermissionArea } from '@upstart/back-office/shared';
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

/** Platform operators (super users) only. */
export const platformAdminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me?.isSuper) return true;

  router.navigate(['/dashboard']);
  return false;
};

/** @deprecated Use adminGuard */
export const superGuard = adminGuard;

/** URL prefix -> the permission area it belongs to. Anything unlisted (dashboard, etc.) is open to staff. */
const AREA_BY_PREFIX: Array<[string, PermissionArea]> = [
  ['/clients', 'clients'], ['/contacts', 'contacts'], ['/pipeline', 'pipeline'], ['/bookings', 'bookings'],
  ['/booking-types', 'bookings'], ['/network', 'network'], ['/inbox', 'inbox'], ['/projects', 'projects'],
  ['/tasks', 'tasks'], ['/time-entry', 'time'], ['/expenses', 'expenses'], ['/invoices', 'invoices'],
  ['/reports', 'reports'],
];

/** Sends staff away from areas their role doesn't grant (admins and guests pass; the API enforces the same). */
export const areaGuard: CanActivateChildFn = async (_route, state) => {
  const me = await inject(SessionService).getReady();
  if (!me || isAdminRole(me.role) || isGuestRole(me.role)) return true;
  const hit = AREA_BY_PREFIX.find(([prefix]) => state.url === prefix || state.url.startsWith(prefix + '/') || state.url.startsWith(prefix + '?'));
  if (!hit || me.permissions?.[hit[1]]) return true;
  return inject(Router).createUrlTree(['/dashboard']);
};
