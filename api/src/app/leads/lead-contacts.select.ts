/** Shared contact shape for pipeline people lists. */
export const contactSelectForSummary = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    title: true,
    phone: true,
    avatarUrl: true,
    isActive: true,
    autoCreated: true,
    emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
    accountLinks: { select: { clientId: true, role: true, isPrimary: true } },
  },
} as const;
