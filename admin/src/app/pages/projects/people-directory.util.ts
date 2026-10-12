import { Person } from '../../task-manager/core/tm.types';
import { PeopleDirectoryEntry } from './people-directory.types';

export type PeopleDirectoryOption = PeopleDirectoryEntry & { label: string };

function lastNameSortKey(entry: PeopleDirectoryEntry): string {
  const last = entry.lastName.trim();
  if (last) return last.toLowerCase();
  const first = entry.firstName.trim();
  if (first) return first.toLowerCase();
  return entry.displayName.toLowerCase();
}

export function sortPeopleByLastName(entries: PeopleDirectoryEntry[]): PeopleDirectoryEntry[] {
  return [...entries].sort((a, b) => {
    const byLast = lastNameSortKey(a).localeCompare(lastNameSortKey(b), undefined, { sensitivity: 'base' });
    if (byLast !== 0) return byLast;
    return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
  });
}

export function directoryListLabel(entry: PeopleDirectoryEntry): string {
  const last = entry.lastName.trim();
  const first = entry.firstName.trim();
  if (last && first) return `${last}, ${first}`;
  return entry.displayName;
}

export function toDirectoryOptions(entries: PeopleDirectoryEntry[]): PeopleDirectoryOption[] {
  return sortPeopleByLastName(entries).map((entry) => ({
    ...entry,
    label: directoryListLabel(entry),
  }));
}

export function toDirectoryAvatarPerson(entry: PeopleDirectoryEntry): Person {
  return {
    id: entry.id,
    name: entry.displayName,
    email: entry.email || entry.id,
    firstName: entry.firstName || null,
    lastName: entry.lastName || null,
    avatarUrl: entry.avatarUrl,
    role: 'MEMBER',
  };
}
