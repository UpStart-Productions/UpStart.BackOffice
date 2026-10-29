// Shared types between API and Angular frontend

export type AttributionUserDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  avatarUrl: string | null;
};

export type RecordAttributionDto = {
  createdBy: AttributionUserDto | null;
  updatedBy: AttributionUserDto | null;
  createdAt: string | null;
  updatedAt: string | null;
};

/** ADMIN: everything. USER: what their tenant role grants. CLIENT: client portal login only. */
export type UserRole = 'ADMIN' | 'USER' | 'CLIENT';

export type AccountJourney = 'PROSPECT' | 'CLIENT' | 'NONE';

export const ACCOUNT_JOURNEY_LABELS: Record<AccountJourney, string> = {
  PROSPECT: 'Prospect',
  CLIENT: 'Client',
  NONE: 'Other',
};

/** Suggested CRM tags for organizations and people; tags are free-form, these just save typing. */
export const CRM_TAG_SUGGESTIONS = ['Network', 'Partner', 'Referral source', 'Vendor'] as const;

export type ClientDto = {
  id: string;
  name: string;
  code?: string | null;
  journey: AccountJourney;
  /** CRM tag names (Partner, Vendor...). */
  tags: string[];
  isReferralReady?: boolean;
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
  attribution?: RecordAttributionDto;
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

export type ProjectContactDto = {
  id: string;
  projectId: string;
  contactId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  sortOrder: number;
};

export type ProjectDto = {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  hourlyRate?: number | null;
  isBillable: boolean;
  isActive: boolean;
  asanaProjectGid?: string | null;
  asanaProjectGids?: string[] | null;
  asanaProjectName?: string | null;
  asanaSectionGid?: string | null;
  asanaSectionGids?: string[] | null;
  asanaSectionName?: string | null;
  client: { id: string; name: string; code: string };
  contacts?: ProjectContactDto[];
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
  /** Set when the time is on the user's own invoice to the organization. */
  tenantInvoiceLineItemId?: string | null;
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
  /** Reimbursable expenses on this line (invoices billed to the organization). */
  expenseIds?: string[];
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
  /** The user's own tenant. Null for super users that have none. */
  tenantId?: string | null;
  /** Platform operator: can switch between tenants. */
  isSuper?: boolean;
  /** Name of the tenant role (USER accounts). */
  roleName?: string | null;
  /** Areas this user can use, per level. Admins can use everything regardless. */
  permissions?: import('./permissions').RolePermissions;
  /** What this user can do per area (create/edit/delete/setup); missing = allowed. */
  actions?: import('./permissions').RoleActions;
  /** Modules switched on for the current tenant (see modules.ts). Areas of other modules don't exist. */
  modules?: string[];
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
  /** Tenant role for USER accounts (null for admins). */
  roleId?: string | null;
  roleName?: string | null;
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
  payUrl?: string | null;
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

export type PublicPayProjectDto = {
  name: string;
  description?: string | null;
};

export type PublicPayViewDto = {
  token: string;
  kind: string;
  title: string;
  amount: number;
  currency: string;
  status: 'OPEN' | 'PAID' | 'UNAVAILABLE';
  publishableKey?: string | null;
  paymentsEnabled: boolean;
  projects: PublicPayProjectDto[];
  invoiceNumber?: string | null;
  dueDate?: string | null;
};
