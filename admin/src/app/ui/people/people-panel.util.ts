import { ContactSummary } from '../../core/communications.api';
import { TeamMember } from '../../core/team.api';
import { PeopleProjectContact } from './people.types';
import { PeoplePanelRowTag } from './people-panel-row.component';

export function peoplePanelContactEmail(c: ContactSummary): string | null {
  const email = c.emails?.find((e) => e.isPrimary)?.email?.trim() || c.emails?.[0]?.email?.trim() || '';
  return email || null;
}

export function peoplePanelTeamFooterTags(m: TeamMember): PeoplePanelRowTag[] {
  const tags: PeoplePanelRowTag[] = [{ label: m.isGuest ? 'Guest' : 'Team', severity: 'secondary' }];
  if (m.isLead) tags.push({ label: 'Lead', severity: 'info' });
  return tags;
}

export function peoplePanelProjectContactEmail(contact: PeopleProjectContact): string | null {
  return contact.email?.trim() || null;
}

export function peoplePanelProjectContactPhone(contact: PeopleProjectContact): string | null {
  return contact.phone?.trim() || null;
}