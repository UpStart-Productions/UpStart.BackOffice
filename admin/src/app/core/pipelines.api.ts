import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';

/** A lane (swim lane) on a pipeline board. */
export interface PipelineLane {
  id: string;
  name: string;
  color: string | null;
  sortOrder: number;
  /** Cards on the board (archived ones not counted). */
  cardCount: number;
}

export interface PipelineSummary {
  id: string;
  name: string;
  sortOrder: number;
  stages: PipelineLane[];
}

/** Tenant-defined relationship pipelines and their lanes. */
@Injectable({ providedIn: 'root' })
export class PipelinesApi {
  private readonly api = inject(ApiService);

  list(): Promise<PipelineSummary[]> {
    return this.api.get('/pipelines');
  }

  create(name: string): Promise<{ id: string; name: string }> {
    return this.api.post('/pipelines', { name });
  }

  rename(id: string, name: string): Promise<{ id: string; name: string }> {
    return this.api.patch(`/pipelines/${id}`, { name });
  }

  remove(id: string): Promise<{ deleted: true }> {
    return this.api.delete(`/pipelines/${id}`);
  }

  addLane(pipelineId: string, name: string): Promise<{ id: string; name: string; sortOrder: number }> {
    return this.api.post(`/pipelines/${pipelineId}/stages`, { name });
  }

  renameLane(stageId: string, name: string): Promise<unknown> {
    return this.api.patch(`/pipeline-stages/${stageId}`, { name });
  }

  reorderLanes(pipelineId: string, stageIds: string[]): Promise<unknown> {
    return this.api.put(`/pipelines/${pipelineId}/stages/order`, { stageIds });
  }

  removeLane(stageId: string, moveTo?: string): Promise<{ deleted: true; moved: number }> {
    return this.api.delete(`/pipeline-stages/${stageId}${moveTo ? `?moveTo=${encodeURIComponent(moveTo)}` : ''}`);
  }
}
