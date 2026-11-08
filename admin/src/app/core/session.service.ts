import { inject, Injectable, signal } from '@angular/core';
import { ApiError, ApiService } from './api.service';
import { allows, type AreaAction, type MeDto, type PermissionArea } from '@upstart/back-office/shared';

export type MeResponse = MeDto;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  readonly me = signal<MeResponse | null>(null);
  private readyPromise: Promise<MeResponse | null> | null = null;
  /** HTTP status of the last failed /users/me load (401 = signed in, but the email isn't a user here). */
  lastLoadStatus: number | null = null;

  /** Whether the signed-in user may take an action in an area (the API enforces the same rule). */
  can(area: PermissionArea, action: AreaAction = 'view'): boolean {
    return allows(this.me(), area, action);
  }

  reset(): void {
    this.readyPromise = null;
    this.me.set(null);
  }

  /** Reload /users/me (e.g. after avatar change). */
  refresh(): Promise<MeResponse | null> {
    this.reset();
    return this.getReady();
  }

  getReady(): Promise<MeResponse | null> {
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrap();
    }
    return this.readyPromise;
  }

  private async bootstrap(): Promise<MeResponse | null> {
    try {
      const profile = await this.api.get<MeResponse>('/users/me');
      this.lastLoadStatus = null;
      this.me.set(profile);
      return profile;
    } catch (err) {
      this.lastLoadStatus = err instanceof ApiError ? err.status : null;
      this.readyPromise = null;
      this.me.set(null);
      return null;
    }
  }
}
