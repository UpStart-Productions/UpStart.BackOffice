/** Persisted embed value for a CRM person card in Quill HTML. */
export type QuillPersonCardValue = {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string | null;
  role: string | null;
  email: string;
  phone: string;
  avatarUrl: string | null;
};

export type QuillPersonCardScope =
  | { type: 'client'; clientId: string }
  | { type: 'project'; clientId: string | null; draftContacts?: () => QuillPersonCardDraftContact[] }
  | { type: 'tmProject'; projectId: string }
  | { type: 'contact'; contactId: string }
  | { type: 'crm' };

export type QuillPersonCardDraftContact = {
  contactId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  avatarUrl?: string | null;
};

export type QuillPersonCardPick = QuillPersonCardValue;
