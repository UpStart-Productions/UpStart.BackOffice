import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';

/** Something put out into the world (website form, UBO form, QR code) that adds people to a pipeline lane. */
export interface CapturePoint {
  id: string;
  name: string;
  pipelineId: string;
  pipelineName: string;
  stageId: string;
  stageName: string;
  /** Set when it is a UBO form's "Send to pipeline". */
  formId: string | null;
  formName: string | null;
  isActive: boolean;
  captureCount: number;
  lastCapturedAt: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class CapturePointsApi {
  private readonly api = inject(ApiService);

  list(filter: { pipelineId?: string; formId?: string } = {}): Promise<CapturePoint[]> {
    const q = new URLSearchParams();
    if (filter.pipelineId) q.set('pipelineId', filter.pipelineId);
    if (filter.formId) q.set('formId', filter.formId);
    const qs = q.toString();
    return this.api.get(`/capture-points${qs ? `?${qs}` : ''}`);
  }

  create(body: { name: string; stageId: string; formId?: string; isActive?: boolean }): Promise<CapturePoint> {
    return this.api.post('/capture-points', body);
  }

  update(id: string, body: { name?: string; stageId?: string; isActive?: boolean }): Promise<CapturePoint> {
    return this.api.patch(`/capture-points/${id}`, body);
  }

  remove(id: string): Promise<{ deleted: true }> {
    return this.api.delete(`/capture-points/${id}`);
  }
}
