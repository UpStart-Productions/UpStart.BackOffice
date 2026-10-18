/**
 * Phase 1: single-tenant stub. The migration seeds one Tenant row with this id.
 * Phase 2 replaces this with a per-request tenant context.
 */
export const DEFAULT_TENANT_ID = 'default';

/**
 * The domain capture addresses live on (alias@INBOUND_EMAIL_DOMAIN). It is the product's own
 * domain, the same in every environment, so it is a constant rather than configuration.
 * Its MX record must point at SES (see docs/inbound-email-setup.md).
 */
export const INBOUND_EMAIL_DOMAIN = 'in.heyupstart.com';
