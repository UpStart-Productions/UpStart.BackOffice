type ProjectContactRow = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  contacts: ProjectContactRow[];
};

type LineItemWithProject = {
  project: ProjectRow | null;
};

export type InvoiceProjectContact = {
  projectId: string;
  projectName: string;
  email: string;
  contactName: string | null;
};

export function buildProjectContacts(lineItems: LineItemWithProject[]): InvoiceProjectContact[] {
  const seen = new Map<string, InvoiceProjectContact>();
  for (const li of lineItems) {
    const project = li.project;
    if (!project) continue;

    for (const contact of project.contacts) {
      const rawEmail = contact.email?.trim();
      if (!rawEmail) continue;

      const key = rawEmail.toLowerCase();
      if (seen.has(key)) continue;

      const nameParts = [contact.firstName, contact.lastName].filter(Boolean);
      seen.set(key, {
        projectId: project.id,
        projectName: project.name,
        email: rawEmail,
        contactName: nameParts.length ? nameParts.join(' ') : null,
      });
    }
  }
  return Array.from(seen.values());
}
