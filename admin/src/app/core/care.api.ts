import { inject, Injectable, signal } from '@angular/core';
import type {
  FormAccess,
  FormAccessLevel,
  CareFormDto,
  CareFormKind,
  CareRecordDto,
  CareRecordListItemDto,
  CareShiftDto,
  CareVisitDto,
  CareVisitListItemDto,
} from '@upstart/back-office/shared';
import { ApiService } from './api.service';

export type CareClientForm = {
  formId: string;
  kind: CareFormKind;
  name: string;
  myAccess: FormAccessLevel;
  recordId: string | null;
  updatedAt: string | null;
};

/** Care module API (forms setup, records, links) plus the pending-intake count for the nav badge. */
@Injectable({ providedIn: 'root' })
export class CareApi {
  private readonly api = inject(ApiService);

  /** Public intakes waiting for review (nav badge). */
  readonly pendingCount = signal(0);

  form(id: string) {
    return this.api.get<CareFormDto>(`/care/forms/${id}`);
  }
  updateForm(id: string, body: { name?: string; description?: string | null; access?: FormAccess }) {
    return this.api.patch(`/care/forms/${id}`, body);
  }
  roles() {
    return this.api.get<{ id: string; name: string }[]>('/care/roles');
  }

  async records(kind: CareFormKind, status?: 'PENDING' | 'ACTIVE') {
    const q = new URLSearchParams({ kind, ...(status ? { status } : {}) });
    const res = await this.api.get<{ items: CareRecordListItemDto[]; myAccess: FormAccessLevel | null; formId: string | null; pendingCount: number }>(
      `/care/records?${q}`,
    );
    if (kind === 'INTAKE') this.pendingCount.set(res.pendingCount);
    return res;
  }
  async refreshPendingCount() {
    try {
      await this.records('INTAKE', 'PENDING');
    } catch {
      this.pendingCount.set(0);
    }
  }
  record(id: string) {
    return this.api.get<CareRecordDto>(`/care/records/${id}`);
  }
  createRecord(formId: string, clientId: string) {
    return this.api.post<{ id: string }>('/care/records', { formId, clientId });
  }
  saveRecord(id: string, values: Record<string, unknown>) {
    return this.api.put<CareRecordDto>(`/care/records/${id}`, { values });
  }
  deleteRecord(id: string) {
    return this.api.delete(`/care/records/${id}`);
  }
  accept(id: string, body: { mode: 'new' | 'existing'; name?: string; clientId?: string }) {
    return this.api.post<CareRecordDto>(`/care/records/${id}/accept`, body);
  }
  forClient(clientId: string) {
    return this.api.get<CareClientForm[]>(`/care/clients/${clientId}`);
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
    return this.api.get<{ formId: string }>('/care/visit-form');
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
