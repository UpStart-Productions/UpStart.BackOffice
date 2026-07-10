import { toPublicAssetUrl } from '../storage/asset-url.util';

export type NetworkContactRecord = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedInUrl: string | null;
  avatarUrl: string | null;
  isPrimary: boolean;
  lastContactDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toStaffNetworkContactView<T extends NetworkContactRecord>(contact: T) {
  return {
    ...contact,
    avatarUrl: toPublicAssetUrl(contact.avatarUrl),
  };
}
