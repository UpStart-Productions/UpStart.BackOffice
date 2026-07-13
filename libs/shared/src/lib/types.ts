// Shared types between API and Angular frontend

export type UserRole = 'ADMIN' | 'MEMBER' | 'CLIENT';

export type ClientDto = {
  id: string;
  name: string;
  code: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  notes?: string | null;
  isActive: boolean;
  portalEnabled?: boolean;
  portalUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectTaskDto = {
  id: string;
  projectId: string;
  name: string;
  source?: 'MANUAL' | 'ASANA';
  asanaTaskGid?: string | null;
  isBillable: boolean;
  sortOrder: number;
  isActive: boolean;
};

export type ProjectDto = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  asanaProjectGid?: string | null;
  asanaProjectName?: string | null;
  asanaSectionGid?: string | null;
  asanaSectionName?: string | null;
  client: { id: string; name: string; code: string };
  tasks?: ProjectTaskDto[];
};

export type TimeEntryDto = {
  id: string;
  userId: string;
  projectId: string;
  projectTaskId?: string | null;
  description?: string | null;
  startedAt: string;
  stoppedAt?: string | null;
  durationMin?: number | null;
  isBillable: boolean;
  hourlyRate?: number | null;
  invoiceLineItemId?: string | null;
  project: { id: string; name: string; client: { id: string; name: string } };
  projectTask?: { id: string; name: string; isBillable: boolean } | null;
  user: { id: string; firstName?: string | null; lastName?: string | null; email: string };
};

export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PAID' | 'VOID';

export type InvoiceLineItemDto = {
  id: string;
  invoiceId: string;
  projectId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  sortOrder: number;
  timeEntryIds?: string[];
  project?: { id: string; name: string } | null;
};

export type InvoiceDto = {
  id: string;
  clientId: string;
  number: number;
  displayNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  notes?: string | null;
  subtotal: number;
  taxRate?: number | null;
  taxAmount?: number | null;
  total: number;
  sentAt?: string | null;
  paidAt?: string | null;
  amountPaid?: number | null;
  client: ClientDto;
  lineItems: InvoiceLineItemDto[];
};

export type MeDto = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  hourlyRate?: number | null;
  clientId?: string | null;
};

export type UserListDto = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  role: UserRole;
  hourlyRate?: number | null;
  isActive: boolean;
  clientId?: string | null;
  client?: { id: string; name: string; code: string } | null;
};

/** Public client org view on the client portal. */
export type PortalClientViewDto = {
  id: string;
  name: string;
  code: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
};

export type PortalSessionDto = {
  client: PortalClientViewDto;
  sessionToken: string;
};

export type PortalInvoiceDto = {
  id: string;
  displayNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate?: string | null;
  total: number;
  paidAt?: string | null;
  lineItems: {
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    project?: { id: string; name: string } | null;
  }[];
};

export type PortalArtifactDto = {
  id: string;
  type: 'FILE' | 'LINK' | 'NOTE';
  title: string;
  fileSize?: number | null;
  mimeType?: string | null;
  url?: string | null;
  content?: string | null;
  createdAt: string;
};

export type PortalProjectDto = {
  id: string;
  name: string;
  description?: string | null;
  isBillable: boolean;
  artifacts: PortalArtifactDto[];
  invoices: PortalInvoiceDto[];
};
