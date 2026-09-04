import { randomBytes } from 'crypto';

export function generatePayToken(): string {
  return randomBytes(32).toString('base64url');
}

export function payBaseUrl(): string {
  return (process.env.PAY_BASE_URL ?? 'http://localhost:4321/pay').replace(/\/$/, '');
}

export function buildPayUrl(token: string): string {
  return `${payBaseUrl()}/${token}`;
}

export function dollarsToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function integrationIdentifier(kind: string): string {
  const suffix = randomBytes(4).toString('hex');
  return `ubo-${kind.toLowerCase()}-${suffix}`;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() && process.env.STRIPE_PUBLISHABLE_KEY?.trim(),
  );
}

export function canAcceptPayment(params: {
  payableStatus: string;
  invoiceStatus?: string | null;
}): boolean {
  if (params.payableStatus !== 'OPEN') return false;
  if (params.invoiceStatus === 'PAID' || params.invoiceStatus === 'VOID') return false;
  return true;
}

export type PayProjectView = {
  name: string;
  description: string | null;
};

export function uniqueProjectsFromLineItems(
  items: { project?: { id?: string; name: string; description?: string | null } | null }[],
): PayProjectView[] {
  const seen = new Set<string>();
  const projects: PayProjectView[] = [];
  for (const item of items) {
    const project = item.project;
    if (!project?.name?.trim()) continue;
    const key = project.id || project.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    projects.push({
      name: project.name.trim(),
      description: project.description?.trim() || null,
    });
  }
  return projects;
}
