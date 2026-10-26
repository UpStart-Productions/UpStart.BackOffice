import { inject, Injectable } from '@angular/core';
import { contactName, ContactSummary, CommunicationsApi } from './communications.api';
import { PeoplePickerLoader } from './people-picker.loader';
import { TmApiService } from '../task-manager/core/tm-api.service';
import type {
  QuillPersonCardDraftContact,
  QuillPersonCardPick,
  QuillPersonCardScope,
  QuillPersonCardValue,
} from './quill-person-card.types';

function primaryEmail(c: ContactSummary): string {
  return (c.emails.find((e) => e.isPrimary) ?? c.emails[0])?.email?.trim() ?? '';
}

function roleForClient(c: ContactSummary, clientId: string | null | undefined): string | null {
  if (!clientId) return c.title?.trim() || null;
  const link = c.accountLinks.find((l) => l.clientId === clientId);
  return link?.role?.trim() || c.title?.trim() || null;
}

function toPick(c: ContactSummary, clientId: string | null | undefined): QuillPersonCardPick | null {
  const email = primaryEmail(c);
  if (!email) return null;
  return {
    contactId: c.id,
    name: contactName(c),
    firstName: c.firstName,
    lastName: c.lastName,
    role: roleForClient(c, clientId),
    email,
    phone: c.phone?.trim() ?? '',
    avatarUrl: c.avatarUrl ?? null,
  };
}

function draftToPick(row: QuillPersonCardDraftContact, clientId: string | null | undefined): QuillPersonCardPick | null {
  const email = row.email.trim();
  if (!email) return null;
  const name = [row.firstName, row.lastName].map((p) => p.trim()).filter(Boolean).join(' ');
  return {
    contactId: row.contactId?.trim() || `draft:${email.toLowerCase()}`,
    name: name || email,
    firstName: row.firstName.trim(),
    lastName: row.lastName.trim() || null,
    role: null,
    email,
    phone: row.phone.trim(),
    avatarUrl: row.avatarUrl ?? null,
  };
}

/** CRM contacts only — never tenant users. */
@Injectable({ providedIn: 'root' })
export class QuillPersonCardPeopleService {
  private readonly comms = inject(CommunicationsApi);
  private readonly directory = inject(PeoplePickerLoader);
  private readonly tm = inject(TmApiService);

  async load(scope: QuillPersonCardScope): Promise<QuillPersonCardPick[]> {
    switch (scope.type) {
      case 'client':
        return this.fromContacts(await this.comms.contacts({ clientId: scope.clientId }), scope.clientId);
      case 'project':
        return this.projectPeople(scope.clientId, scope.draftContacts?.() ?? []);
      case 'tmProject': {
        const project = await this.tm.getProject(scope.projectId).catch(() => null);
        if (!project) return this.crmDirectory();
        const drafts = project.contacts.map((c) => ({
          contactId: c.contactId,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone,
          avatarUrl: c.avatarUrl,
        }));
        return this.projectPeople(project.client?.id ?? null, drafts);
      }
      case 'contact':
        return this.contactPeople(scope.contactId);
      case 'crm':
        return this.crmDirectory();
    }
  }

  toEmbedValue(pick: QuillPersonCardPick): QuillPersonCardValue {
    return { ...pick };
  }

  private async crmDirectory(): Promise<QuillPersonCardPick[]> {
    const options = await this.directory.loadCrmContacts();
    return options
      .map((o) => {
        const contactId = o.id.startsWith('contact:') ? o.id.slice('contact:'.length) : o.id;
        const name = o.label.trim();
        return {
          contactId,
          name,
          firstName: o.firstName,
          lastName: o.lastName || null,
          role: null,
          email: o.email.trim(),
          phone: o.phone?.trim() ?? '',
          avatarUrl: o.avatarUrl ?? null,
        } satisfies QuillPersonCardPick;
      })
      .filter((p) => p.email);
  }

  private async contactPeople(contactId: string): Promise<QuillPersonCardPick[]> {
    const contact = await this.comms.contact(contactId);
    const clientIds = [...new Set(contact.accountLinks.map((l) => l.clientId))];
    if (!clientIds.length) {
      const self = toPick(contact, null);
      return self ? [self] : [];
    }
    const lists = await Promise.all(clientIds.map((id) => this.comms.contacts({ clientId: id }).catch(() => [] as ContactSummary[])));
    return this.dedupe(lists.flat(), null);
  }

  private async projectPeople(clientId: string | null, drafts: QuillPersonCardDraftContact[]): Promise<QuillPersonCardPick[]> {
    const fromApi = clientId ? await this.comms.contacts({ clientId }).catch(() => [] as ContactSummary[]) : [];
    const merged = this.dedupe(fromApi, clientId);
    const seen = new Set(merged.map((p) => p.email.toLowerCase()));
    for (const row of drafts) {
      const pick = draftToPick(row, clientId);
      if (!pick || seen.has(pick.email.toLowerCase())) continue;
      seen.add(pick.email.toLowerCase());
      merged.push(pick);
    }
    return merged.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  private fromContacts(rows: ContactSummary[], clientId: string | null | undefined): QuillPersonCardPick[] {
    return this.dedupe(rows, clientId);
  }

  private dedupe(rows: ContactSummary[], clientId: string | null | undefined): QuillPersonCardPick[] {
    const byEmail = new Map<string, QuillPersonCardPick>();
    for (const row of rows) {
      const pick = toPick(row, clientId);
      if (!pick) continue;
      byEmail.set(pick.email.toLowerCase(), pick);
    }
    return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
}
