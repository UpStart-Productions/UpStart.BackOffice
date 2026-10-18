import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';

export type InteractionType = 'EMAIL' | 'CALL' | 'MEETING' | 'NOTE';
export type InteractionDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';

export interface InteractionParticipant {
  email: string;
  name: string | null;
  role: 'FROM' | 'TO' | 'CC' | 'BCC' | 'ATTENDEE';
  contactId: string | null;
  userId: string | null;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  direction: InteractionDirection;
  occurredAt: string;
  subject: string | null;
  snippet: string | null;
  /** Only present on the single-item endpoint. */
  bodyText?: string | null;
  hasRaw: boolean;
  source: 'FORWARD' | 'BCC' | 'CALENDAR' | 'MANUAL';
  status: 'FILED' | 'UNFILED';
  clientId: string | null;
  leadId: string | null;
  participants: InteractionParticipant[];
  captures: { capturedByEmail: string; userId: string | null }[];
  loggedBy: { id: string; name: string | null } | null;
}

export interface TimelinePage {
  items: Interaction[];
  nextBefore: string | null;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  autoCreated: boolean;
  lastContactAt: string | null;
  emails: { id: string; email: string; isPrimary: boolean }[];
  accountLinks: {
    clientId: string;
    role: string | null;
    isPrimary: boolean;
    client: { id: string; name: string };
  }[];
}

export type TimelineTarget = { clientId: string } | { leadId: string } | { contactId: string };

export interface LogInteractionPayload {
  type: 'CALL' | 'MEETING' | 'NOTE';
  clientId?: string;
  leadId?: string;
  occurredAt?: string;
  subject?: string;
  bodyText?: string;
  direction?: InteractionDirection;
  contactIds?: string[];
}

export function contactName(c: Pick<ContactSummary, 'firstName' | 'lastName'>): string {
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
}

/** "Ann Lee" or the bare address when there is no name. */
export function personLabel(p: Pick<InteractionParticipant, 'name' | 'email'>): string {
  return p.name?.trim() || p.email || 'Unknown';
}

/** One line describing who was on an interaction, e.g. "Ann Lee → Lori, Judy". */
export function participantLine(i: Pick<Interaction, 'participants'>): string {
  const from = i.participants.find((p) => p.role === 'FROM');
  const rest = i.participants.filter((p) => p.role !== 'FROM').map(personLabel);
  if (from) return rest.length ? `${personLabel(from)} → ${rest.join(', ')}` : personLabel(from);
  return rest.join(', ');
}

export function interactionIcon(type: InteractionType): string {
  switch (type) {
    case 'EMAIL':
      return 'pi-envelope';
    case 'CALL':
      return 'pi-phone';
    case 'MEETING':
      return 'pi-calendar';
    default:
      return 'pi-file-edit';
  }
}

/** Thin wrapper over the /communications and /contacts endpoints. */
@Injectable({ providedIn: 'root' })
export class CommunicationsApi {
  private readonly api = inject(ApiService);

  /** Number of emails waiting in the Unfiled inbox (drives the nav badge). */
  readonly unfiledCount = signal(0);

  async refreshUnfiledCount(): Promise<void> {
    try {
      const res = await this.api.get<{ count: number }>('/communications/unfiled/count');
      this.unfiledCount.set(res.count);
    } catch {
      // The badge is cosmetic; never let it break navigation.
    }
  }

  timeline(target: TimelineTarget, before?: string | null): Promise<TimelinePage> {
    const qs = before ? `?before=${encodeURIComponent(before)}` : '';
    if ('clientId' in target) return this.api.get(`/communications/accounts/${target.clientId}/timeline${qs}`);
    if ('leadId' in target) return this.api.get(`/communications/leads/${target.leadId}/timeline${qs}`);
    return this.api.get(`/contacts/${target.contactId}/timeline${qs}`);
  }

  unfiled(before?: string | null): Promise<TimelinePage> {
    return this.api.get(`/communications/unfiled${before ? `?before=${encodeURIComponent(before)}` : ''}`);
  }

  interaction(id: string): Promise<Interaction> {
    return this.api.get(`/communications/interactions/${id}`);
  }

  log(payload: LogInteractionPayload): Promise<Interaction> {
    return this.api.post('/communications/interactions', payload);
  }

  file(id: string, target: { clientId?: string; leadId?: string; learn?: boolean }) {
    return this.api.post<{ contactsLinked: number }>(`/communications/interactions/${id}/file`, target);
  }

  unfile(id: string) {
    return this.api.post(`/communications/interactions/${id}/unfile`, {});
  }

  contacts(opts: { q?: string; clientId?: string; review?: boolean } = {}): Promise<ContactSummary[]> {
    const params = new URLSearchParams();
    if (opts.q?.trim()) params.set('q', opts.q.trim());
    if (opts.clientId) params.set('clientId', opts.clientId);
    if (opts.review) params.set('review', 'true');
    const qs = params.toString();
    return this.api.get(`/contacts${qs ? `?${qs}` : ''}`);
  }

  contact(id: string): Promise<ContactSummary> {
    return this.api.get(`/contacts/${id}`);
  }

  createContact(body: {
    firstName: string;
    lastName?: string;
    email?: string;
    clientId?: string;
    role?: string;
  }): Promise<ContactSummary> {
    return this.api.post('/contacts', body);
  }

  updateContact(id: string, body: Partial<Pick<ContactSummary, 'firstName' | 'lastName' | 'title' | 'phone' | 'notes' | 'isActive' | 'autoCreated'>>) {
    return this.api.patch<ContactSummary>(`/contacts/${id}`, body);
  }

  addEmail(id: string, email: string, isPrimary = false) {
    return this.api.post<ContactSummary>(`/contacts/${id}/emails`, { email, isPrimary });
  }

  removeEmail(id: string, email: string) {
    return this.api.delete<ContactSummary>(`/contacts/${id}/emails/${encodeURIComponent(email)}`);
  }

  linkAccount(id: string, clientId: string, role?: string) {
    return this.api.post<ContactSummary>(`/contacts/${id}/accounts`, { clientId, role: role || undefined });
  }

  unlinkAccount(id: string, clientId: string) {
    return this.api.delete<ContactSummary>(`/contacts/${id}/accounts/${clientId}`);
  }
}
