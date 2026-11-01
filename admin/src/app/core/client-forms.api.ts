import { inject, Injectable } from '@angular/core';
import type { ClientFormResultDto, ClientFormsPanelDto } from '@upstart/back-office/shared';
import { ApiService } from './api.service';

/** Client forms on client pages: a client's results, adding one, editing it and its share links (base for app-form-links). */
@Injectable({ providedIn: 'root' })
export class ClientFormsApi {
  private readonly api = inject(ApiService);
  /** The base app-form-links uses for share links ({base}/records/:id/links). */
  readonly base = '/client-forms';

  panel(clientId: string) {
    return this.api.get<ClientFormsPanelDto>(`${this.base}/clients/${clientId}`);
  }
  create(formId: string, clientId: string) {
    return this.api.post<{ id: string }>(`${this.base}/records`, { formId, clientId });
  }
  result(id: string) {
    return this.api.get<ClientFormResultDto>(`${this.base}/records/${id}`);
  }
  save(id: string, values: Record<string, unknown>) {
    return this.api.put<ClientFormResultDto>(`${this.base}/records/${id}`, { values });
  }
  changeClient(id: string, clientId: string) {
    return this.api.patch<ClientFormResultDto>(`${this.base}/records/${id}/client`, { clientId });
  }
  remove(id: string) {
    return this.api.delete(`${this.base}/records/${id}`);
  }
}
