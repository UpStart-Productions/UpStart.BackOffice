import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  bindMentionPopoverOutsideClose,
  bindMentionPopoverScrollGuard,
  clusterMentionCandidates,
  renderMentionDropdownItem,
  unbindMentionPopoverOutsideClose,
  unbindMentionPopoverScrollGuard,
  type MentionQuillItem,
} from './mention-quill.util';

type MentionUserCandidate = {
  kind: 'user';
  id: string;
  label: string;
  firstName: string;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
};

type MentionContactCandidate = {
  kind: 'contact';
  id: string;
  label: string;
  email: string | null;
};

type MentionTaskCandidate = {
  kind: 'task';
  id: string;
  label: string;
  projectId: string;
  projectName: string;
};

type MentionProjectCandidate = {
  kind: 'project';
  id: string;
  label: string;
  clientName: string | null;
};

type MentionCrmProjectCandidate = {
  kind: 'crmProject';
  id: string;
  label: string;
  clientName: string | null;
};

type MentionInvoiceCandidate = {
  kind: 'invoice';
  id: string;
  label: string;
};

type MentionCandidate =
  | MentionUserCandidate
  | MentionContactCandidate
  | MentionTaskCandidate
  | MentionProjectCandidate
  | MentionCrmProjectCandidate
  | MentionInvoiceCandidate;

export type MentionQuillContext = 'activity' | 'default';

export type MentionQuillToolbar =
  | boolean
  | Array<string | Record<string, unknown> | Array<string | Record<string, unknown>>>;

export type MentionQuillModuleOptions = {
  clientId?: string | null;
  projectId?: string | null;
  /** Activity log: org-scoped people, invoices, projects; tasks when typing 2+ chars. */
  context?: MentionQuillContext;
  /** `false` hides toolbar; pass a custom array to override the default full toolbar. */
  toolbar?: MentionQuillToolbar;
};

@Injectable({ providedIn: 'root' })
export class MentionCandidatesService {
  private readonly api = inject(ApiService);

  /** Quill `modules` with API-backed @mentions (people, contacts, tasks, projects). */
  quillModules(options: MentionQuillModuleOptions = {}) {
    const clientId = options.clientId?.trim() || null;
    const projectId = options.projectId?.trim() || null;
    const mentionContext = options.context === 'activity' ? 'activity' : null;

    const defaultToolbar: MentionQuillToolbar = [
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'image', 'contentFile', 'code-block', 'lucideIcon', 'personCard'],
    ];
    const toolbar =
      options.toolbar === false
        ? false
        : Array.isArray(options.toolbar)
          ? options.toolbar
          : defaultToolbar;

    return {
      toolbar,
      mention: {
        positioningStrategy: 'fixed' as const,
        allowedChars: /^[A-Za-z0-9\sÀ-ÿ.'#()\-]*$/,
        mentionDenotationChars: ['@'],
        mentionContainerClass: 'mention-suggest-container',
        mentionListClass: 'mention-suggest-list',
        listItemClass: 'mention-suggest-list-item',
        dataAttributes: [
          'id',
          'value',
          'denotationChar',
          'mentionType',
          'email',
          'projectId',
          'projectName',
          'clientName',
        ],
        showDenotationChar: true,
        source: (
          searchTerm: string,
          renderList: (matches: MentionQuillItem[], term: string) => void,
        ) => {
          const params = new URLSearchParams();
          if (searchTerm.trim()) params.set('q', searchTerm.trim());
          if (clientId) params.set('clientId', clientId);
          if (projectId) params.set('projectId', projectId);
          if (mentionContext) params.set('context', mentionContext);
          if (mentionContext === 'activity') params.set('limit', '30');

          this.api
            .get<{ candidates: MentionCandidate[] }>(
              `/mentions/candidates${params.size ? `?${params}` : ''}`,
            )
            .then((res) =>
              renderList(
                clusterMentionCandidates(res.candidates, searchTerm, {
                  activity: mentionContext === 'activity',
                }).map((c) => this.toQuillItem(c)),
                searchTerm,
              ),
            )
            .catch(() => renderList([], searchTerm));
        },
        renderItem: (item: MentionQuillItem, searchTerm: string) =>
          renderMentionDropdownItem(item, searchTerm),
        onOpen: function (this: { mentionContainer: HTMLElement; hideMentionList: () => void }) {
          queueMicrotask(() => {
            const el = this.mentionContainer;
            el.style.zIndex = '10000';
            bindMentionPopoverScrollGuard(el);
            bindMentionPopoverOutsideClose({
              mentionContainer: el,
              hideMentionList: () => this.hideMentionList(),
            });
          });
        },
        onBeforeClose: function (this: { mentionContainer: HTMLElement }) {
          const el = this.mentionContainer;
          unbindMentionPopoverScrollGuard(el);
          unbindMentionPopoverOutsideClose(el);
        },
      },
    };
  }

  private toQuillItem(candidate: MentionCandidate): MentionQuillItem {
    if (candidate.kind === 'user') {
      return {
        id: candidate.id,
        value: candidate.label,
        mentionType: 'user',
        email: candidate.email,
        firstName: candidate.firstName,
        lastName: candidate.lastName ?? undefined,
        avatarUrl: candidate.avatarUrl ?? undefined,
      };
    }
    if (candidate.kind === 'contact') {
      return {
        id: candidate.id,
        value: candidate.label,
        mentionType: 'contact',
        email: candidate.email ?? undefined,
      };
    }
    if (candidate.kind === 'task') {
      return {
        id: candidate.id,
        value: candidate.label,
        mentionType: 'task',
        projectId: candidate.projectId,
        projectName: candidate.projectName,
      };
    }
    if (candidate.kind === 'invoice') {
      return {
        id: candidate.id,
        value: candidate.label,
        mentionType: 'invoice',
      };
    }
    if (candidate.kind === 'crmProject') {
      return {
        id: candidate.id,
        value: candidate.label,
        mentionType: 'crmProject',
        clientName: candidate.clientName ?? undefined,
      };
    }
    return {
      id: candidate.id,
      value: candidate.label,
      mentionType: 'project',
      clientName: candidate.clientName ?? undefined,
    };
  }
}
