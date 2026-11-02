import { inject, Injectable } from '@angular/core';
import type { ClientFormResultDto, ClientFormsPanelDto, FormAttachInfoDto, FormAttachTargetDto } from '@upstart/back-office/shared';
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
  /** Auto-save: just the answers that changed. */
  save(id: string, values: Record<string, unknown>) {
    return this.api.put<ClientFormResultDto>(`${this.base}/records/${id}`, { values });
  }
  submit(id: string) {
    return this.api.post<ClientFormResultDto>(`${this.base}/records/${id}/submit`, {});
  }
  reopen(id: string) {
    return this.api.post<ClientFormResultDto>(`${this.base}/records/${id}/reopen`, {});
  }
  /** Move dialog: who will see it where it goes. */
  moveInfo(id: string) {
    return this.api.get<FormAttachInfoDto>(`${this.base}/records/${id}/attach-info`);
  }
  /** Every client and organization the user reaches (Attach and Move pickers). */
  targets() {
    return this.api.get<FormAttachTargetDto[]>(`${this.base}/targets`);
  }
  changeClient(id: string, clientId: string) {
    return this.api.patch<ClientFormResultDto>(`${this.base}/records/${id}/client`, { clientId });
  }
  remove(id: string) {
    return this.api.delete(`${this.base}/records/${id}`);
  }
}
