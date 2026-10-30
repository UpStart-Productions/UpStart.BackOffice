import { inject, Injectable } from '@angular/core';
import type {
  FormDefinition, FormSettings, FormSubmissionDto, FormSubmissionListItemDto, FormSubmissionStatus, FreeFormDto, FreeFormListItemDto,
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
  export(id: string) {
    return this.api.get<FormDefinition>(`${this.base}/forms/${id}/export`);
  }
  form(id: string) {
    return this.api.get<FreeFormDto>(`${this.base}/forms/${id}`);
  }
  update(id: string, body: { name?: string; description?: string | null; settings?: FormSettings }) {
    return this.api.patch<FreeFormDto>(`${this.base}/forms/${id}`, body);
  }
  remove(id: string) {
    return this.api.delete(`${this.base}/forms/${id}`);
  }
  publish(id: string) {
    return this.api.post<FreeFormDto>(`${this.base}/forms/${id}/publish`, {});
  }

  submissions(formId: string, status?: FormSubmissionStatus) {
    const q = status ? `?status=${status}` : '';
    return this.api.get<{ items: FormSubmissionListItemDto[]; pendingCount: number }>(`${this.base}/forms/${formId}/submissions${q}`);
  }
  submission(id: string) {
    return this.api.get<FormSubmissionDto>(`${this.base}/submissions/${id}`);
  }
  accept(id: string, body: { mode: 'new' | 'existing'; name?: string; clientId?: string }) {
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
