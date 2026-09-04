export type ReceiptPayer = {
  email: string;
  name: string;
};

export function resolveReceiptPayer(
  session: {
    customer_details?: { email?: string | null; name?: string | null } | null;
    customer_email?: string | null;
  },
  client?: { email?: string | null; name?: string | null } | null,
): ReceiptPayer | null {
  const email =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    client?.email?.trim() ||
    '';
  if (!email) return null;
  const name = session.customer_details?.name?.trim() || client?.name?.trim() || '';
  return { email, name };
}

export function formatReceiptDate(paidAt: Date): string {
  return paidAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
