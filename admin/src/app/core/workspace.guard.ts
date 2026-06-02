import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthStoreService } from './auth-store.service';
import { WorkspaceService } from './workspace.service';

/** Ensures workspace slug is set before workspace-scoped routes load. */
export const workspaceGuard: CanActivateFn = async () => {
  const workspace = inject(WorkspaceService);
  const auth = inject(AuthStoreService);
  const router = inject(Router);

  const me = await workspace.getReady();
  if (me && auth.workspaceSlug) return true;

  sessionStorage.setItem(
    'ubo_auth_error',
    me
      ? 'No workspace found for your account. Run npm run dev:seed.'
      : 'Could not verify your account. In dev, use admin@upstart.test after running npm run dev:seed.',
  );
  auth.clear();
  workspace.reset();
  router.navigate(['/login']);
  return false;
};
