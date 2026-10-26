import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { CognitoAuthService } from './cognito-auth.service';

function stashReturnUrl(url: string): void {
  try {
    sessionStorage.setItem('ubo_return_url', url);
  } catch {
    /* storage unavailable */
  }
}

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

/** Public Claude/MCP connect page: send unsigned-in people through login, then back here. */
export const mcpConnectGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthStoreService);
  const cognito = inject(CognitoAuthService);
  const router = inject(Router);

  const signedIn = cognito.useCognito ? !!(await cognito.getIdToken()) : !!auth.baseEmail;
  if (signedIn) return true;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route.queryParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  stashReturnUrl(query ? `/mcp-connect?${query}` : '/mcp-connect');
  router.navigate(['/login']);
  return false;
};
