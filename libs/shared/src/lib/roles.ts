import type { UserRole } from './types';

export function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN';
}

/** Admins and role-based users: everyone who signs in to the back office (not client portal logins). */
export function isBackOfficeRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'USER';
}

export function isClientRole(role: UserRole): boolean {
  return role === 'CLIENT';
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'USER':
      return 'User';
    case 'CLIENT':
      return 'Client';
  }
}
