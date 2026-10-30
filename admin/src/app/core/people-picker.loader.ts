import { inject, Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { PeopleDirectoryEntry } from '../pages/projects/people-directory.types';
import { PeopleDirectoryOption, toDirectoryOptions } from '../pages/projects/people-directory.util';
import { TmApiService } from '../task-manager/core/tm-api.service';
import { Person } from '../task-manager/core/tm.types';

export function contactIdFromDirectoryId(id: string | null | undefined): string | null {
  if (!id?.startsWith('contact:')) return null;
  return id.slice('contact:'.length);
}

@Injectable({ providedIn: 'root' })
export class PeoplePickerLoader {
  private readonly api = inject(ApiService);
  private readonly tm = inject(TmApiService);

  /** CRM People only (for org/project links). */
  async loadCrmContacts(opts: {
    excludeContactIds?: string[];
    excludeProjectId?: string;
  } = {}): Promise<PeopleDirectoryOption[]> {
    const exclude = new Set(opts.excludeContactIds ?? []);
    const params = new URLSearchParams({ limit: '250', crmOnly: 'true' });
    if (opts.excludeProjectId) params.set('excludeProjectId', opts.excludeProjectId);
    const rows = await this.api
      .get<PeopleDirectoryEntry[]>(`/search/people?${params}`)
      .catch(() => [] as PeopleDirectoryEntry[]);
    const available = rows.filter((row) => {
      if (row.source !== 'CONTACT' || !row.id.startsWith('contact:')) return false;
      const id = row.id.slice('contact:'.length);
      return !exclude.has(id);
    });
    return toDirectoryOptions(available);
  }

  /** Team users plus CRM People (for Task Share). Deduped by email; team row wins. */
  async loadTeamAndCrm(opts: {
    tmProjectId: string;
    excludeEmails?: string[];
  }): Promise<PeopleDirectoryOption[]> {
    const memberEmails = new Set((opts.excludeEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean));
    const params = new URLSearchParams({ limit: '250', crmOnly: 'true' });
    const [crmRows, team] = await Promise.all([
      this.api.get<PeopleDirectoryEntry[]>(`/search/people?${params}`).catch(() => [] as PeopleDirectoryEntry[]),
      this.tm.shareCandidates(opts.tmProjectId).catch(() => [] as Person[]),
    ]);

    const byEmail = new Map<string, PeopleDirectoryEntry>();

    for (const p of team) {
      const email = p.email.trim();
      if (!email || memberEmails.has(email.toLowerCase())) continue;
      byEmail.set(email.toLowerCase(), {
        id: `user:${p.id}`,
        source: 'USER',
        sourceLabel: p.isGuest ? 'Guest collaborator' : 'Team member',
        firstName: p.firstName ?? '',
        lastName: p.lastName ?? '',
        email,
        phone: '',
        displayName: p.name,
        avatarUrl: p.avatarUrl,
      });
    }

    for (const row of crmRows) {
      if (row.source !== 'CONTACT' || !row.email.trim()) continue;
      const key = row.email.trim().toLowerCase();
      if (memberEmails.has(key)) continue;
      if (!byEmail.has(key)) byEmail.set(key, row);
    }

    return toDirectoryOptions([...byEmail.values()]);
  }
}
