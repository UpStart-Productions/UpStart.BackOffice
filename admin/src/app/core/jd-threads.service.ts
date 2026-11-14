import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { HelpSidePanelService } from './help-side-panel.service';

export type JdThreadSummary = {
  id: string;
  title: string;
  recordType: string | null;
  recordId: string | null;
  updatedAt: string;
  messageCount: number;
};

export type JdThread = {
  id: string;
  title: string;
  messages: unknown[];
  recordType: string | null;
  recordId: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Ask JD about a record from elsewhere in the app (e.g. a Dashboard suggestion). */
export type JdOpenRequest = {
  /** Resume this record's conversation, or start one tied to it. */
  recordType?: string;
  recordId?: string;
  /** Title for a new conversation. */
  title?: string;
  /** Sent as the first message once JD is open. */
  prompt?: string;
  /** Changes each call so the same request can be made twice. */
  nonce: number;
};

/** Saved JD conversations (private to the signed-in person, kept 30 days after last use). */
@Injectable({ providedIn: 'root' })
export class JdThreadsService {
  private readonly api = inject(ApiService);
  private readonly panel = inject(HelpSidePanelService);

  /** Set by openFor(); the chat panel picks it up. */
  readonly request = signal<JdOpenRequest | null>(null);

  /** Open the JD panel on a record's conversation (and send the prompt, if any). */
  openFor(req: Omit<JdOpenRequest, 'nonce'>): void {
    this.request.set({ ...req, nonce: Date.now() });
    this.panel.openGuide();
  }

  list(): Promise<JdThreadSummary[]> {
    return this.api.get('/help-agent/threads');
  }

  get(id: string): Promise<JdThread> {
    return this.api.get(`/help-agent/threads/${encodeURIComponent(id)}`);
  }

  forRecord(recordType: string, recordId: string): Promise<JdThread | null> {
    return this.api.get(
      `/help-agent/threads/for-record?recordType=${encodeURIComponent(recordType)}&recordId=${encodeURIComponent(recordId)}`,
    );
  }

  create(body: { title?: string; messages?: unknown[]; recordType?: string | null; recordId?: string | null }): Promise<JdThread> {
    return this.api.post('/help-agent/threads', body);
  }

  update(id: string, body: { title?: string; messages?: unknown[] }): Promise<JdThread> {
    return this.api.put(`/help-agent/threads/${encodeURIComponent(id)}`, body);
  }

  remove(id: string): Promise<{ deleted: true }> {
    return this.api.delete(`/help-agent/threads/${encodeURIComponent(id)}`);
  }
}
