import { inject, Injectable } from '@angular/core';
import type { CareClientOverviewDto, CareShiftDto, CareStatus, CareVisitDto, CareVisitListItemDto } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

/** Care module API: a client's care status, visits and the schedule. */
@Injectable({ providedIn: 'root' })
export class CareApi {
  private readonly api = inject(ApiService);

  /** A client's Care tab: status and whether the user may change it. */
  careClient(clientId: string) {
    return this.api.get<CareClientOverviewDto>(`/care/clients/${clientId}`);
  }
  /** Add to care (ACTIVE), pause, end, or take out of care (null). */
  setCareStatus(clientId: string, status: CareStatus | null) {
    return this.api.put<CareClientOverviewDto>(`/care/clients/${clientId}/status`, { status });
  }

  // ── Visits ─────────────────────────────────────────────────────────────────

  workers() {
    return this.api.get<{ id: string; name: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null }[]>(
      '/care/workers',
    );
  }
  visits(params: { from?: string; to?: string; clientId?: string | null; userId?: string | null }) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return this.api.get<{ items: CareVisitListItemDto[]; inProgress: CareVisitListItemDto | null }>(`/care/visits?${q}`);
  }
  visitForm() {
    return this.api.get<{ formId: string | null }>('/care/visit-form');
  }
  visit(id: string) {
    return this.api.get<CareVisitDto>(`/care/visits/${id}`);
  }
  createVisit(body: { clientId: string; userId?: string; shiftId?: string; startedAt?: string; endedAt?: string; notes?: string }) {
    return this.api.post<CareVisitDto>('/care/visits', body);
  }
  updateVisit(id: string, body: { startedAt?: string; endedAt?: string; notes?: string | null; values?: Record<string, unknown> }) {
    return this.api.put<CareVisitDto>(`/care/visits/${id}`, body);
  }
  endVisit(id: string, body: { notes?: string | null; values?: Record<string, unknown> }) {
    return this.api.post<CareVisitDto>(`/care/visits/${id}/end`, body);
  }
  deleteVisit(id: string) {
    return this.api.delete(`/care/visits/${id}`);
  }

  // ── Schedule ───────────────────────────────────────────────────────────────

  shifts(params: { from: string; to: string; clientId?: string | null; userId?: string | null }) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    return this.api.get<CareShiftDto[]>(`/care/shifts?${q}`);
  }
  createShift(body: ShiftInput & { repeat?: { weekdays: number[]; until?: string } }) {
    return this.api.post<{ shift: CareShiftDto; conflicts: number }>('/care/shifts', body);
  }
  updateShift(id: string, body: Partial<ShiftInput>) {
    return this.api.put<{ shift: CareShiftDto; conflicts: number }>(`/care/shifts/${id}`, body);
  }
  cancelShift(id: string) {
    return this.api.post<CareShiftDto>(`/care/shifts/${id}/cancel`, {});
  }
  restoreShift(id: string) {
    return this.api.post<CareShiftDto>(`/care/shifts/${id}/restore`, {});
  }
  deleteShift(id: string, following = false) {
    return this.api.delete<{ deleted: number }>(`/care/shifts/${id}${following ? '?following=true' : ''}`);
  }
}

export type ShiftInput = {
  clientId: string;
  userId: string | null;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  notes?: string | null;
};
