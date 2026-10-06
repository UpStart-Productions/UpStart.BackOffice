export type PersonDto = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  role: string;
};

export const personSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  name: true,
  avatarUrl: true,
  role: true,
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
  };
}
