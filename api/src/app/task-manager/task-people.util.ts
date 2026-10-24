import { GUEST_ROLE } from '@upstart/back-office/shared';

export type PersonDto = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
  /** On the built-in Guest role (an outside collaborator). */
  isGuest: boolean;
};

export const personSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  name: true,
  avatarUrl: true,
  role: true,
  tenantRole: { select: { key: true } },
} as const;

export function personName(user: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email: string;
}): string {
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fromParts || user.name?.trim() || user.email;
}

export function toPerson(
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    name: string | null;
    avatarUrl: string | null;
    role: string;
    tenantRole?: { key: string | null } | null;
  },
  toAssetUrl: (stored: string | null) => string | null,
): PersonDto {
  return {
    id: user.id,
    name: personName(user),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: toAssetUrl(user.avatarUrl),
    role: user.role,
    isGuest: user.tenantRole?.key === GUEST_ROLE.key,
  };
}
