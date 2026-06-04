import type { Client } from '@prisma/client';
import { buildPortalUrl } from './portal-token.util';

/** Fields safe to expose on the public client portal. */
export function toPortalClientView(client: Pick<Client, 'id' | 'name' | 'code' | 'email' | 'phone' | 'website'>) {
  return {
    id: client.id,
    name: client.name,
    code: client.code,
    email: client.email,
    phone: client.phone,
    website: client.website,
  };
}

/** Staff-facing client record including portal link (never expose raw token separately). */
export function toStaffClientView(
  client: Pick<
    Client,
    | 'id'
    | 'name'
    | 'code'
    | 'email'
    | 'phone'
    | 'address'
    | 'city'
    | 'state'
    | 'zip'
    | 'website'
    | 'notes'
    | 'category'
    | 'isActive'
    | 'portalEnabled'
    | 'portalToken'
    | 'portalTokenCreatedAt'
    | 'createdAt'
    | 'updatedAt'
  >,
) {
  const { portalToken, ...rest } = client;
  return {
    ...rest,
    portalUrl:
      client.portalEnabled && portalToken ? buildPortalUrl(portalToken) : null,
  };
}
