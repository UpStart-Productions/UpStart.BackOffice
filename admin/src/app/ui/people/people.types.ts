/** One person on a project contact list (draft until project save). */
export type PeopleProjectContact = {
  id?: string;
  contactId?: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  sortOrder: number;
  avatarUrl?: string | null;
};

export type PeoplePanelMode = 'organization' | 'project';
