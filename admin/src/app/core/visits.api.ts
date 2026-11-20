import { inject, Injectable } from '@angular/core';
import type { ClientVisitDto, VisitDetailDto, VisitDto, VisitTypeDto } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

/** Schedule: visits, visit types and the team members who can be given visits. */
@Injectable({ providedIn: 'root' })
export class VisitsApi {
  private readonly api = inject(ApiService);

  teamMembers() {
    return this.api.get<{ id: string; name: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null }[]>(
      '/visits/team-members',
    );
  }

  // ── Visit types ────────────────────────────────────────────────────────────

  /** Types that can be picked (not hidden). */
  visitTypes() {
    return this.api.get<VisitTypeDto[]>('/visit-types');
  }
  /** Every type with its visit count (Settings, admins). */
  manageVisitTypes() {
    return this.api.get<VisitTypeDto[]>('/visit-types/manage');
  }
  createVisitType(name: string) {
    return this.api.post<VisitTypeDto>('/visit-types', { name });
  }
  hideVisitType(id: string) {
    return this.api.post(`/visit-types/${id}/hide`, {});
  }
  restoreVisitType(id: string) {
    return this.api.post(`/visit-types/${id}/restore`, {});
  }
  deleteVisitType(id: string) {
    return this.api.delete(`/visit-types/${id}`);
  }

  // ── Visits ─────────────────────────────────────────────────────────────────

  visits(params: { from: string; to: string; clientId?: string | null; userId?: string | null }) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return this.api.get<VisitDto[]>(`/visits?${q}`);
  }
  /** A client's past visits (newest first) with their forms. */
  clientHistory(clientId: string) {
    return this.api.get<ClientVisitDto[]>(`/visits/client/${clientId}/history`);
  }
  visit(id: string) {
    return this.api.get<VisitDetailDto>(`/visits/${id}`);
  }
  createVisit(body: VisitInput & { repeat?: { weekdays: number[]; until?: string } }) {
    return this.api.post<{ visit: VisitDto; conflicts: number }>('/visits', body);
  }
  updateVisit(id: string, body: Partial<VisitInput> & { startedAt?: string; endedAt?: string }) {
    return this.api.put<{ visit: VisitDto; conflicts: number }>(`/visits/${id}`, body);
  }
  startVisit(id: string) {
    return this.api.post<VisitDetailDto>(`/visits/${id}/start`, {});
  }
  finishVisit(id: string) {
    return this.api.post<VisitDetailDto>(`/visits/${id}/finish`, {});
  }
  cancelVisit(id: string) {
    return this.api.post<VisitDto>(`/visits/${id}/cancel`, {});
  }
  restoreVisit(id: string) {
    return this.api.post<VisitDto>(`/visits/${id}/restore`, {});
  }
  deleteVisit(id: string, following = false) {
    return this.api.delete<{ deleted: number }>(`/visits/${id}${following ? '?following=true' : ''}`);
  }
}

export type VisitInput = {
  clientId: string;
  userId: string | null;
  visitTypeId: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  notes?: string | null;
};
