import { Injectable, inject } from '@angular/core';
import { contactName, type ContactSummary } from './communications.api';
import { ApiService } from './api.service';
import { buildQuillRecordMention, type QuillRecordMentionValue } from './quill-mention-paste.util';
import {
  anchorTextLooksLikeUrl,
  type AppRecordRef,
  placeholderRecordTitle,
} from './quill-app-record-deep-link.util';
import type { TaskDetail } from '../task-manager/core/tm.types';

@Injectable({ providedIn: 'root' })
export class QuillPasteService {
  private readonly api = inject(ApiService);

  async recordMentionForPaste(
    ref: AppRecordRef,
    labelHint?: string,
  ): Promise<QuillRecordMentionValue> {
    const hint = labelHint?.trim();
    const useHint = hint && !anchorTextLooksLikeUrl(hint, '');

    try {
      switch (ref.kind) {
        case 'task': {
          const task = await this.api.get<TaskDetail>(`/tm/tasks/${ref.taskId}`);
          const projectName =
            task.projects?.find((p) => p.id === ref.projectId)?.name?.trim() ||
            task.project?.name?.trim() ||
            '';
          return buildQuillRecordMention(
            ref,
            useHint ? hint : task.name,
            { projectName },
          );
        }
        case 'tmProject': {
          const project = await this.api.get<{ name: string }>(`/tm/projects/${ref.projectId}`);
          return buildQuillRecordMention(ref, useHint ? hint : project.name);
        }
        case 'crmProject': {
          const project = await this.api.get<{ name: string; client?: { name: string } | null }>(
            `/projects/${ref.projectId}`,
          );
          return buildQuillRecordMention(ref, useHint ? hint : project.name, {
            clientName: project.client?.name ?? '',
          });
        }
        case 'client': {
          const client = await this.api.get<{ name: string }>(`/clients/${ref.clientId}`);
          return buildQuillRecordMention(ref, useHint ? hint : client.name);
        }
        case 'invoice': {
          const invoice = await this.api.get<{ displayNumber: string }>(`/invoices/${ref.invoiceId}`);
          return buildQuillRecordMention(ref, useHint ? hint : invoice.displayNumber);
        }
        case 'contact': {
          const contact = await this.api.get<ContactSummary>(`/contacts/${ref.contactId}`);
          return buildQuillRecordMention(ref, useHint ? hint : contactName(contact));
        }
      }
    } catch {
      return buildQuillRecordMention(ref, useHint ? hint : placeholderRecordTitle(ref));
    }
  }
}
