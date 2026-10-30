import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { allows, areaEnabled, isAdminRole, isBackOfficeRole, tasksOnly, type AreaAction, type PermissionArea } from '@upstart/back-office/shared';
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
    if (!isBackOfficeRole(me.role)) {
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
      if (!isBackOfficeRole(me.role)) {
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

/** Only users whose role allows the action in the area (e.g. Bookings setup for booking types). */
export function actionGuard(area: PermissionArea, action: AreaAction): CanActivateFn {
  return async () => {
    const me = await inject(SessionService).getReady();
    return allows(me, area, action) ? true : inject(Router).createUrlTree(['/dashboard']);
  };
}

export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  const me = await session.getReady();
  if (me && isAdminRole(me.role)) return true;

  router.navigate(['/dashboard']);
  return false;
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

/** URL prefix -> the permission area it belongs to. Anything unlisted (dashboard, etc.) is open to every user. */
const AREA_BY_PREFIX: Array<[string, PermissionArea]> = [
  ['/organizations', 'clients'], ['/clients', 'clients'], ['/people', 'contacts'], ['/contacts', 'contacts'], ['/pipeline', 'pipeline'], ['/bookings', 'bookings'], ['/forms', 'forms'],
  ['/booking-types', 'bookings'], ['/inbox', 'inbox'], ['/activity', 'inbox'], ['/projects', 'projects'],
  ['/tasks', 'tasks'], ['/time-entry', 'time'], ['/expenses', 'expenses'], ['/invoices', 'invoices'],
  ['/reports', 'reports'], ['/care/visits', 'visits'], ['/care/schedule', 'schedule'], ['/care', 'care'],
];

/**
 * Sends users away from areas their role doesn't grant (admins pass; the API enforces the same), and everyone
 * away from areas of modules that are off for the tenant.
 * A Tasks-only role (like Guest) only ever sees the Task Manager.
 */
export const areaGuard: CanActivateChildFn = async (_route, state) => {
  const me = await inject(SessionService).getReady();
  if (!me) return true;
  const hit = AREA_BY_PREFIX.find(([prefix]) => state.url === prefix || state.url.startsWith(prefix + '/') || state.url.startsWith(prefix + '?'));
  // An area of a module that is off for this tenant doesn't exist, even for admins.
  if (hit && !areaEnabled(me.modules, hit[1])) return inject(Router).createUrlTree(['/dashboard']);
  if (isAdminRole(me.role)) return true;
  if (tasksOnly(me)) {
    return /^\/tasks(\/|$|\?)/.test(state.url) ? true : inject(Router).createUrlTree(['/tasks']);
  }
  if (!hit || me.permissions?.[hit[1]]) return true;
  return inject(Router).createUrlTree(['/dashboard']);
};
