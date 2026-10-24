/** Zero-byte marker so empty prefixes appear as folders in S3 consoles (Cyberduck, etc.). */
export const FOLDER_PLACEHOLDER = '.keep';

export function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function clientRootPrefix(clientId: string): string {
  return `clients/${clientId}`;
}

export function clientInvoicesPrefix(clientId: string): string {
  return `clients/${clientId}/invoices`;
}

/** Client projects live under the client; personal/internal projects (no client) under `projects/`. */
export function projectRootPrefix(clientId: string | null | undefined, projectId: string): string {
  return clientId ? `clients/${clientId}/projects/${projectId}` : `projects/${projectId}`;
}

/** Client invoices live under the client; invoices billed to the tenant (no client) under `invoices/`. */
export function invoicePdfKey(clientId: string | null, displayNumber: string): string {
  const prefix = clientId ? clientInvoicesPrefix(clientId) : 'invoices';
  return `${prefix}/${sanitizeFileSegment(displayNumber)}.pdf`;
}
