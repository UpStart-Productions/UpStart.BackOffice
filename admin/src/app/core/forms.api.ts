import { inject, Injectable } from '@angular/core';
import type {
  FormAccess, FormDefinition, FormSettings, FormStaffPreviewDto, FormSubmissionDto, FormSubmissionListItemDto, FormAttachInfoDto, FormSubmissionFilter, FreeFormDto,
  FreeFormListItemDto, PendingSubmissionDto,
} from '@upstart/back-office/shared';
import { ApiService } from './api.service';

/** Forms area API (free-standing forms): forms, Publish, submissions. Fields and links go through the shared builder and links panel. */
@Injectable({ providedIn: 'root' })
export class FormsApi {
  private readonly api = inject(ApiService);
  /** The base the builder and links panel use. */
  readonly base = '/form-admin';

  list() {
    return this.api.get<FreeFormListItemDto[]>(`${this.base}/forms`);
  }
  create(body: { name: string; description?: string | null }) {
    return this.api.post<{ id: string }>(`${this.base}/forms`, body);
  }
  import(definition: unknown, name?: string) {
    return this.api.post<{ id: string }>(`${this.base}/forms/import`, { definition, ...(name ? { name } : {}) });
  }
  /** Add a form file's sections after the form's own (nothing existing changes). */
  importInto(id: string, definition: unknown) {
    return this.api.post<{ sections: number; fields: number }>(`${this.base}/forms/${id}/import`, { definition });
  }
  export(id: string) {
    return this.api.get<FormDefinition>(`${this.base}/forms/${id}/export`);
  }
  form(id: string) {
    return this.api.get<FreeFormDto>(`${this.base}/forms/${id}`);
  }
  preview(id: string) {
    return this.api.get<FormStaffPreviewDto>(`${this.base}/forms/${id}/preview`);
  }
  update(id: string, body: { name?: string; description?: string | null; settings?: FormSettings; access?: FormAccess }) {
    return this.api.patch<FreeFormDto>(`${this.base}/forms/${id}`, body);
  }
  remove(id: string) {
    return this.api.delete(`${this.base}/forms/${id}`);
  }
  addSection(formId: string, name: string, description?: string | null) {
    return this.api.post<{ id: string; name: string }>(`${this.base}/forms/${formId}/sections`, { name, description: description ?? null });
  }
  reorderSections(formId: string, ids: string[]) {
    return this.api.post(`${this.base}/forms/${formId}/sections/order`, { ids });
  }
  unpublish(id: string) {
    return this.api.post<FreeFormDto>(`${this.base}/forms/${id}/unpublish`, {});
  }
  publish(id: string) {
    return this.api.post<FreeFormDto>(`${this.base}/forms/${id}/publish`, {});
  }

  /** Roles for Who can use it (client forms). */
  roles() {
    return this.api.get<{ id: string; name: string }[]>(`${this.base}/roles`);
  }
  /** Submissions waiting for review across every form the user can see (Dashboard). */
  pending() {
    return this.api.get<PendingSubmissionDto[]>(`${this.base}/pending`);
  }
  /** Attach dialog: suggested records and who will see the response. */
  attachInfo(id: string) {
    return this.api.get<FormAttachInfoDto>(`${this.base}/submissions/${id}/attach-info`);
  }

  submissions(formId: string, status?: FormSubmissionFilter, clientId?: string | null) {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (clientId) p.set('clientId', clientId);
    const q = p.toString() ? `?${p}` : '';
    return this.api.get<{ items: FormSubmissionListItemDto[]; pendingCount: number; inProgressCount: number }>(`${this.base}/forms/${formId}/submissions${q}`);
  }
  /** Every submission with answers (for Export to Excel). */
  exportSubmissions(formId: string, status?: FormSubmissionFilter, clientId?: string | null) {
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (clientId) p.set('clientId', clientId);
    const q = p.toString() ? `?${p}` : '';
    return this.api.get<FormSubmissionDto[]>(`${this.base}/forms/${formId}/submissions/export${q}`);
  }
  submission(id: string) {
    return this.api.get<FormSubmissionDto>(`${this.base}/submissions/${id}`);
  }
  accept(id: string, body: { mode: 'new' | 'existing'; newKind?: 'client' | 'organization'; name?: string; clientId?: string }) {
    return this.api.post<FormSubmissionDto>(`${this.base}/submissions/${id}/accept`, body);
  }
  dismiss(id: string) {
    return this.api.post<FormSubmissionDto>(`${this.base}/submissions/${id}/dismiss`, {});
  }
  restore(id: string) {
    return this.api.post<FormSubmissionDto>(`${this.base}/submissions/${id}/restore`, {});
  }
  deleteSubmission(id: string) {
    return this.api.delete(`${this.base}/submissions/${id}`);
  }
}
