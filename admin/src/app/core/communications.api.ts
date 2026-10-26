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
  /** Contact photo, else the team member's. */
  avatarUrl?: string | null;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  direction: InteractionDirection;
  occurredAt: string;
  subject: string | null;
  /** Where a meeting took place. */
  location?: string | null;
  snippet: string | null;
  /** New text only (quoted history removed). */
  bodyText?: string | null;
  /** The email has quoted history that is not in bodyText. */
  quoted?: boolean;
  /** Only on the single-item endpoint, when quoted history was removed: the whole message. */
  fullText?: string | null;
  hasRaw: boolean;
  source: 'FORWARD' | 'BCC' | 'CC' | 'CALENDAR' | 'MANUAL';
  status: 'FILED' | 'UNFILED';
  clientId: string | null;
  leadId: string | null;
  participants: InteractionParticipant[];
  captures: { capturedByEmail: string; userId: string | null }[];
  loggedBy: { id: string; name: string | null; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null } | null;
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
  avatarUrl?: string | null;
  notes: string | null;
  isActive: boolean;
  autoCreated: boolean;
  lastContactAt: string | null;
  /** CRM tag names (Partner, Referral source...). */
  tags: string[];
  emails: { id: string; email: string; isPrimary: boolean }[];
  accountLinks: {
    clientId: string;
    role: string | null;
    isPrimary: boolean;
    client: { id: string; name: string; journey: 'PROSPECT' | 'CLIENT' | 'NONE' };
  }[];
}

export interface CaptureSettings {
  inboundDomain: string;
  primaryAlias: string | null;
  address: string | null;
  aliases: { alias: string; isPrimary: boolean; address: string | null }[];
  internalDomains: string[];
  verifications: {
    id: string;
    gmailAddress: string | null;
    code: string | null;
    link: string | null;
    receivedAt: string;
    alias: string;
  }[];
}

export type TimelineTarget = { clientId: string } | { leadId: string } | { contactId: string };

export interface LogInteractionPayload {
  type: 'CALL' | 'MEETING' | 'NOTE';
  clientId?: string;
  leadId?: string;
  occurredAt?: string;
  subject?: string;
  location?: string;
  bodyText?: string;
  direction?: InteractionDirection;
  contactIds?: string[];
  /** Team members besides the person logging the activity. */
  userIds?: string[];
}

export interface TeamMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string;
  avatarUrl: string | null;
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

/** Sender and everyone else, as people (for avatar + name display). */
export function senderAndRecipients(i: Pick<Interaction, 'participants'>): {
  from: InteractionParticipant | null;
  to: InteractionParticipant[];
} {
  return {
    from: i.participants.find((p) => p.role === 'FROM') ?? null,
    to: i.participants.filter((p) => p.role !== 'FROM'),
  };
}

/** Sender and recipients as separate strings, for list rows. */
export function participantParts(i: Pick<Interaction, 'participants'>): { from: string; to: string } {
  const from = i.participants.find((p) => p.role === 'FROM');
  const rest = i.participants.filter((p) => p.role !== 'FROM').map(personLabel);
  return { from: from ? personLabel(from) : '—', to: rest.length ? rest.join(', ') : '—' };
}

export const DIRECTION_LABEL = { INBOUND: 'Incoming', OUTBOUND: 'Outgoing', INTERNAL: 'Internal' } as const;

const CALL_LABEL = { INBOUND: 'They called', OUTBOUND: 'We called', INTERNAL: 'Internal' } as const;

export function directionLabel(i: Pick<Interaction, 'type' | 'direction'>): string {
  if (i.type === 'NOTE') return 'Note';
  if (i.type === 'MEETING') return 'Meeting';
  if (i.type === 'CALL') return CALL_LABEL[i.direction];
  return DIRECTION_LABEL[i.direction];
}

/** "5m ago", "Yesterday", "Mar 3" (adds the year when it is not this year). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso);
  const minutes = Math.floor((now - then.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
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

  private captureAddressRequest: Promise<string | null> | null = null;

  /** The address to CC so an email is logged in UpStart Back Office. Cached for the session; null if not set up. */
  captureAddress(): Promise<string | null> {
    this.captureAddressRequest ??= this.api
      .get<{ address: string | null }>('/communications/capture-address')
      .then((r) => r.address)
      .catch(() => {
        this.captureAddressRequest = null;
        return null;
      });
    return this.captureAddressRequest;
  }

  /** Number of emails waiting in the Unfiled inbox (drives the nav badge). */
  readonly unfiledCount = signal(0);

  /** Auto-created contacts waiting for review (drives the Contacts nav badge). */
  readonly reviewCount = signal(0);

  async refreshReviewCount(): Promise<void> {
    try {
      const res = await this.api.get<{ count: number }>('/contacts/review/count');
      this.reviewCount.set(res.count);
    } catch {
      // Cosmetic badge; never break navigation.
    }
  }

  async refreshUnfiledCount(): Promise<void> {
    try {
      const res = await this.api.get<{ count: number }>('/communications/unfiled/count');
      this.unfiledCount.set(res.count);
    } catch {
      // The badge is cosmetic; never let it break navigation.
    }
  }

  captureSettings(): Promise<CaptureSettings> {
    return this.api.get('/communications/capture-settings');
  }

  setCaptureAlias(alias: string): Promise<CaptureSettings> {
    return this.api.put('/communications/capture-settings/alias', { alias });
  }

  setInternalDomains(domains: string[]): Promise<CaptureSettings> {
    return this.api.put('/communications/capture-settings/internal-domains', { domains });
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

  /** Active staff for Who was involved. */
  team(): Promise<TeamMember[]> {
    return this.api.get('/communications/team');
  }

  file(id: string, target: { clientId?: string; leadId?: string; learn?: boolean }) {
    return this.api.post<{ contactsLinked: number; threadItemsFiled: number }>(
      `/communications/interactions/${id}/file`,
      target,
    );
  }

  unfile(id: string) {
    return this.api.post(`/communications/interactions/${id}/unfile`, {});
  }

  /** Email this activity to the people picked. Teammates also get a notification. */
  forward(id: string, body: { userIds?: string[]; contactIds?: string[] }) {
    return this.api.post<{ emailed: number; notified: number; failed: number }>(`/communications/interactions/${id}/forward`, body);
  }

  remove(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/communications/interactions/${id}`);
  }

  contacts(opts: { q?: string; clientId?: string; review?: boolean; tag?: string | null } = {}): Promise<ContactSummary[]> {
    const params = new URLSearchParams();
    if (opts.q?.trim()) params.set('q', opts.q.trim());
    if (opts.tag) params.set('tag', opts.tag);
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
    title?: string;
    clientId?: string;
    role?: string;
    tags?: string[];
  }): Promise<ContactSummary> {
    return this.api.post('/contacts', body);
  }

  updateContact(id: string, body: Partial<Pick<ContactSummary, 'firstName' | 'lastName' | 'title' | 'phone' | 'notes' | 'isActive' | 'autoCreated' | 'tags'>>) {
    return this.api.patch<ContactSummary>(`/contacts/${id}`, body);
  }

  deleteContact(id: string) {
    return this.api.delete<{ deleted: boolean }>(`/contacts/${id}`);
  }

  removeAvatar(id: string) {
    return this.api.delete<ContactSummary>(`/contacts/${id}/avatar`);
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
