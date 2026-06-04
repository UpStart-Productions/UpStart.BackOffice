import type { UserRole } from './types';

export function isAdminRole(role: UserRole): boolean {
  return role === 'ADMIN';
}

export function isStaffRole(role: UserRole): boolean {
  return role === 'ADMIN' || role === 'MEMBER';
}

export function isClientRole(role: UserRole): boolean {
  return role === 'CLIENT';
}

export function roleLabel(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'MEMBER':
      return 'Staff';
    case 'CLIENT':
      return 'Client';
  }
}
