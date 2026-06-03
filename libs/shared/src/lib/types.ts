// Shared types between API and Angular frontend

export type UserRole = 'ADMIN' | 'MEMBER';

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
  createdAt: string;
  updatedAt: string;
};

export type ProjectDto = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  client: { id: string; name: string; code: string };
};

export type TimeEntryDto = {
  id: string;
  userId: string;
  projectId: string;
  description?: string | null;
  startedAt: string;
  stoppedAt?: string | null;
  durationMin?: number | null;
  isBillable: boolean;
  hourlyRate?: number | null;
  invoiceLineItemId?: string | null;
  project: { id: string; name: string; client: { id: string; name: string } };
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
  isSuper: boolean;
};

export type UserListDto = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  role: UserRole;
  hourlyRate?: number | null;
  isActive: boolean;
  isSuper: boolean;
};
