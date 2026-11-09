import type { Client } from '@prisma/client';
import { buildPortalUrl } from './portal-token.util';
import { clientDimensionsDto } from '../dimensions/dimensions.util';

type ClientDimensionRows = { values: string[]; definition: { key: string } }[];

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

/** Back-office client record including portal link (never expose raw token separately). */
export function toClientView(
  client: { dimensionValues?: ClientDimensionRows } & Pick<
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
    | 'linkedInUrl'
    | 'notes'
    | 'category'
    | 'journey'
    | 'isPublicFeatured'
    | 'isReferralReady'
    | 'lastContactAt'
    | 'isActive'
    | 'portalEnabled'
    | 'portalToken'
    | 'portalTokenCreatedAt'
    | 'createdAt'
    | 'updatedAt'
  >,
) {
  const { portalToken, dimensionValues, ...rest } = client;
  return {
    ...rest,
    dimensions: clientDimensionsDto(dimensionValues),
    portalUrl: client.portalEnabled && portalToken ? buildPortalUrl(portalToken) : null,
  };
}
