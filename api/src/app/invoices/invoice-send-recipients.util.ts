type ProjectRow = {
  id: string;
  name: string;
  contactEmail: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
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
    const rawEmail = project?.contactEmail?.trim();
    if (!project || !rawEmail) continue;

    const key = rawEmail.toLowerCase();
    if (seen.has(key)) continue;

    const nameParts = [project.contactFirstName, project.contactLastName].filter(Boolean);
    seen.set(key, {
      projectId: project.id,
      projectName: project.name,
      email: rawEmail,
      contactName: nameParts.length ? nameParts.join(' ') : null,
    });
  }
  return Array.from(seen.values());
}
