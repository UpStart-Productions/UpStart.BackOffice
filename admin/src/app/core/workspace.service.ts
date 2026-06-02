import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { AuthStoreService } from './auth-store.service';

export type MeResponse = {
  firstName?: string;
  lastName?: string;
  email: string;
  workspaces: { slug: string; name: string }[];
};

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly auth = inject(AuthStoreService);
  private readonly api = inject(ApiService);

  private readyPromise: Promise<MeResponse | null> | null = null;

  /** Clears cached /users/me result (e.g. after sign-out or failed login). */
  reset(): void {
    this.readyPromise = null;
  }

  /** Loads /users/me once and sets default workspace slug when missing. */
  getReady(): Promise<MeResponse | null> {
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrap();
    }
    return this.readyPromise;
  }

  private async bootstrap(): Promise<MeResponse | null> {
    try {
      const me = await this.api.get<MeResponse>('/users/me');
      if (!this.auth.workspaceSlug && me.workspaces.length > 0) {
        this.auth.workspaceSlug = me.workspaces[0].slug;
      }
      return me;
    } catch {
      this.readyPromise = null;
      return null;
    }
  }
}
