import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import type { MeDto } from '@upstart/back-office/shared';

export type MeResponse = MeDto;

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  private readyPromise: Promise<MeResponse | null> | null = null;

  reset(): void {
    this.readyPromise = null;
  }

  getReady(): Promise<MeResponse | null> {
    if (!this.readyPromise) {
      this.readyPromise = this.bootstrap();
    }
    return this.readyPromise;
  }

  private async bootstrap(): Promise<MeResponse | null> {
    try {
      return await this.api.get<MeResponse>('/users/me');
    } catch {
      this.readyPromise = null;
      return null;
    }
  }
}
