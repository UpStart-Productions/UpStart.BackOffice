import {
  type AppRecordRef,
  placeholderRecordTitle,
} from './quill-app-record-deep-link.util';

/** quill-mention embed value (dataset keys). */
export type QuillRecordMentionValue = {
  id: string;
  value: string;
  denotationChar: string;
  mentionType: string;
  projectId?: string;
  projectName?: string;
  clientName?: string;
};

export function buildQuillRecordMention(
  ref: AppRecordRef,
  label: string,
  extras: { projectId?: string; projectName?: string; clientName?: string } = {},
): QuillRecordMentionValue {
  const value = label.trim() || placeholderRecordTitle(ref);
  const base = {
    value,
    denotationChar: '@',
    projectName: extras.projectName?.trim() ?? '',
    clientName: extras.clientName?.trim() ?? '',
  };

  switch (ref.kind) {
    case 'task':
      return {
        ...base,
        id: `task:${ref.taskId}`,
        mentionType: 'task',
        projectId: ref.projectId,
      };
    case 'tmProject':
      return {
        ...base,
        id: `project:${ref.projectId}`,
        mentionType: 'project',
      };
    case 'crmProject':
      return {
        ...base,
        id: `crmProject:${ref.projectId}`,
        mentionType: 'crmProject',
      };
    case 'client':
      return {
        ...base,
        id: `client:${ref.clientId}`,
        mentionType: 'client',
      };
    case 'invoice':
      return {
        ...base,
        id: `invoice:${ref.invoiceId}`,
        mentionType: 'invoice',
      };
    case 'contact':
      return {
        ...base,
        id: `contact:${ref.contactId}`,
        mentionType: 'contact',
      };
  }
}
