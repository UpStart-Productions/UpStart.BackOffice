import { inject, Injectable, signal } from '@angular/core';
import type {
  CareFormAccess,
  CareFormAccessLevel,
  CareFormDto,
  CareFormKind,
  CareLinkDto,
  CareLinkVerify,
  CareRecordDto,
  CareRecordListItemDto,
} from '@upstart/back-office/shared';
import { ApiService } from './api.service';

export type CareFormListItem = {
  id: string;
  kind: CareFormKind;
  name: string;
  description: string | null;
  access: CareFormAccess;
  fieldCount: number;
  recordCount: number;
  linkCount: number;
  myAccess: CareFormAccessLevel | null;
};

export type CareClientForm = {
  formId: string;
  kind: CareFormKind;
  name: string;
  myAccess: CareFormAccessLevel;
  recordId: string | null;
  updatedAt: string | null;
};

export type NewCareLink = {
  label?: string;
  verify: CareLinkVerify;
  passcode?: string;
  email?: string;
  expiresInDays?: number | null;
};

/** Care module API (forms setup, records, links) plus the pending-intake count for the nav badge. */
@Injectable({ providedIn: 'root' })
export class CareApi {
  private readonly api = inject(ApiService);

  /** Public intakes waiting for review (nav badge). */
  readonly pendingCount = signal(0);

  forms() {
    return this.api.get<{ forms: CareFormListItem[]; canSetup: boolean }>('/care/forms');
  }
  form(id: string) {
    return this.api.get<CareFormDto>(`/care/forms/${id}`);
  }
  updateForm(id: string, body: { name?: string; description?: string | null; access?: CareFormAccess }) {
    return this.api.patch(`/care/forms/${id}`, body);
  }
  roles() {
    return this.api.get<{ id: string; name: string }[]>('/care/roles');
  }

  async records(kind: CareFormKind, status?: 'PENDING' | 'ACTIVE') {
    const q = new URLSearchParams({ kind, ...(status ? { status } : {}) });
    const res = await this.api.get<{ items: CareRecordListItemDto[]; myAccess: CareFormAccessLevel | null; formId: string | null; pendingCount: number }>(
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

  formLinks(formId: string) {
    return this.api.get<CareLinkDto[]>(`/care/forms/${formId}/links`);
  }
  createFormLink(formId: string, body: NewCareLink) {
    return this.api.post<CareLinkDto>(`/care/forms/${formId}/links`, body);
  }
  recordLinks(recordId: string) {
    return this.api.get<CareLinkDto[]>(`/care/records/${recordId}/links`);
  }
  createRecordLink(recordId: string, body: NewCareLink) {
    return this.api.post<CareLinkDto>(`/care/records/${recordId}/links`, body);
  }
  revokeLink(id: string) {
    return this.api.post<CareLinkDto>(`/care/links/${id}/revoke`, {});
  }
}
