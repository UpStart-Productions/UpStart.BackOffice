import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthStoreService);
  const cognito = inject(CognitoAuthService);
  const router = inject(Router);

  if (cognito.useCognito) {
    const token = await cognito.getIdToken();
    if (!token) { router.navigate(['/login']); return false; }
    return true;
  }

  if (!auth.baseEmail) { router.navigate(['/login']); return false; }
  return true;
};

export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthStoreService);
  const cognito = inject(CognitoAuthService);
  const router = inject(Router);

  if (cognito.useCognito) {
    const token = await cognito.getIdToken();
    if (token) { router.navigate(['/dashboard']); return false; }
    return true;
  }

  if (auth.baseEmail) { router.navigate(['/dashboard']); return false; }
  return true;
};
